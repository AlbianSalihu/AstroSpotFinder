"""
Cloud-cover sky-fraction filter using Open-Meteo real-time forecast data.

Algorithm overview
------------------
For every observer point on a ~1 km grid over the isochrone:

1. **Cloud sampling**: cloud cover (low / mid / high layer) is fetched at a
   ~10 km grid covering the isochrone bounding box + 50 km buffer, in a small
   number of parallel batch requests to the Open-Meteo API (no auth required).

2. **Directional ray sampling**: 16 azimuths × 8 elevation angles are cast
   from each observer.  Elevation angles are equally spaced in sin(θ) above
   MIN_ELEVATION_DEG (10°) so each direction represents an equal solid angle
   of the celestial hemisphere — matching the convention used by the terrain
   horizon filter.

   For each direction (az, θ) and each cloud layer at altitude H:
   - The ray intersects the cloud layer at horizontal distance r = H / tan(θ).
   - Cloud cover C at the corresponding ground position is read by bilinear
     interpolation from the cloud grid.

3. **Clear fraction per direction**: modelling the three layers as independent,
   the probability that a ray in this direction reaches clear sky is:
       clear(az, θ) = (1 − C_low) × (1 − C_mid) × (1 − C_high)

4. **Sky fraction**:
       F = mean over all (az, θ) directions of clear(az, θ)

   Because directions are sampled with equal solid-angle spacing, this is a
   direct estimate of the fraction of the usable sky hemisphere that is
   cloud-free.

5. **Filter polygon**: thresholded at min_sky_fraction, vectorised, intersected
   with the isochrone polygon — identical pipeline to all other filters.

Precision note
--------------
Open-Meteo's underlying model resolution is ~7 km in Europe (ICON-EU) and
~25 km globally (ERA5/GFS).  Output polygon boundaries therefore have ~7 km
spatial accuracy.  The result includes a ``fetched_at`` timestamp because
cloud cover is ephemeral (updated roughly hourly by the NWP models).
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone
from typing import Any

import httpx
import numpy as np
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from app.models.cloud_cover import CloudFilterRequest, CloudFilterResult

_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Representative altitude for each cloud layer (metres).
# Open-Meteo layers: low = 0–3 km, mid = 3–8 km, high = 8 km+
_LAYER_ALTITUDES_M: list[float] = [1_500.0, 5_000.0, 10_000.0]

# Minimum elevation angle below which sky directions are ignored (degrees).
# 10° matches the terrain horizon filter and reflects the practical limit of
# naked-eye astronomy (atmospheric extinction is severe below ~15°).
_MIN_EL_DEG = 10.0

_N_AZ = 16   # azimuth samples (22.5° spacing)
_N_EL = 8    # elevation samples, equally spaced in sin(θ) above _MIN_EL_DEG

_CLOUD_GRID_STEP_DEG = 0.09   # cloud sampling grid (~10 km at mid-latitudes)
_CLOUD_BUFFER_DEG = 0.45      # buffer around isochrone bbox (~50 km)
_OBS_GRID_STEP_DEG = 0.007    # observer output grid (~700 m at mid-latitudes)

# Gaussian blur sigma in observer-grid pixels applied to the sky-fraction raster
# before thresholding.  This converts the hard 10 km staircase boundary that would
# otherwise appear from the cloud data grid into a smooth gradient, giving clean
# polygon edges that reflect real cloud-system geometry rather than NWP grid artefacts.
# sigma = 5 px × 0.007° × 111 km/° ≈ 3.9 km — roughly half the cloud data resolution.
_SMOOTH_SIGMA_PX = 5.0

_BATCH_SIZE = 50   # max locations per Open-Meteo request (URL length safety)


class CloudFilterError(Exception):
    """Raised when the cloud filter cannot be computed."""


# ---------------------------------------------------------------------------
# HTTP fetch helpers
# ---------------------------------------------------------------------------

async def _fetch_batch(
    client: httpx.AsyncClient,
    lats: list[float],
    lons: list[float],
) -> list[dict[str, Any]]:
    response = await client.get(
        _OPEN_METEO_URL,
        params={
            "latitude": ",".join(f"{v:.4f}" for v in lats),
            "longitude": ",".join(f"{v:.4f}" for v in lons),
            "current": "cloud_cover_low,cloud_cover_mid,cloud_cover_high",
            "timeformat": "unixtime",
        },
    )
    response.raise_for_status()
    data = response.json()
    return [data] if isinstance(data, dict) else data


async def _fetch_cloud_grid(
    lats: np.ndarray,
    lons: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Return (c_low, c_mid, c_high) arrays of shape (N,) with values 0–100.
    Points that fail to fetch default to 0 (treated as clear sky).
    """
    n = len(lats)
    batches = [
        (lats[i : i + _BATCH_SIZE].tolist(), lons[i : i + _BATCH_SIZE].tolist())
        for i in range(0, n, _BATCH_SIZE)
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        raw = await asyncio.gather(
            *[_fetch_batch(client, lb, lo) for lb, lo in batches],
            return_exceptions=True,
        )

    c_low = np.zeros(n, dtype=np.float32)
    c_mid = np.zeros(n, dtype=np.float32)
    c_high = np.zeros(n, dtype=np.float32)

    idx = 0
    for result in raw:
        if isinstance(result, Exception):
            idx += _BATCH_SIZE
            continue
        for item in result:
            if idx >= n:
                break
            cur = item.get("current", {})
            c_low[idx] = float(cur.get("cloud_cover_low") or 0)
            c_mid[idx] = float(cur.get("cloud_cover_mid") or 0)
            c_high[idx] = float(cur.get("cloud_cover_high") or 0)
            idx += 1

    return c_low, c_mid, c_high


# ---------------------------------------------------------------------------
# Spatial smoothing
# ---------------------------------------------------------------------------

def _gaussian_blur_2d(arr: np.ndarray, sigma: float) -> np.ndarray:
    """
    Separable Gaussian blur in pure numpy.

    Each axis is convolved with a 1-D Gaussian kernel of the given sigma
    (in pixels).  Edge pixels are extended by replication to avoid border
    shrinkage.  The result has the same shape and dtype (float32) as the
    input.
    """
    if sigma < 0.5:
        return arr.astype(np.float32)

    radius = max(1, int(math.ceil(3.0 * sigma)))
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel = (kernel / kernel.sum()).astype(np.float32)

    out = arr.astype(np.float32)

    # Row-wise pass
    padded = np.pad(out, [(0, 0), (radius, radius)], mode="edge")
    out = np.zeros_like(arr, dtype=np.float32)
    for i, w in enumerate(kernel):
        out += w * padded[:, i : i + arr.shape[1]]

    # Column-wise pass
    padded = np.pad(out, [(radius, radius), (0, 0)], mode="edge")
    result = np.zeros_like(arr, dtype=np.float32)
    for i, w in enumerate(kernel):
        result += w * padded[i : i + arr.shape[0], :]

    return result


# ---------------------------------------------------------------------------
# Interpolation
# ---------------------------------------------------------------------------

def _bilinear(
    field: np.ndarray,   # (N_lat, N_lon) values on a regular grid
    lat0: float,         # latitude at row 0 (northernmost)
    lon0: float,         # longitude at col 0 (westernmost)
    dlat: float,         # positive step southward (lat0 − step = row 1 latitude)
    dlon: float,         # positive step eastward
    q_lat: np.ndarray,   # arbitrary shape — query latitudes
    q_lon: np.ndarray,   # same shape — query longitudes
) -> np.ndarray:
    """Bilinear interpolation; clamps out-of-bounds queries to the grid edge."""
    N_lat, N_lon = field.shape
    row_f = (lat0 - q_lat) / dlat
    col_f = (q_lon - lon0) / dlon

    r0 = np.clip(np.floor(row_f).astype(np.int32), 0, N_lat - 2)
    c0 = np.clip(np.floor(col_f).astype(np.int32), 0, N_lon - 2)
    r1, c1 = r0 + 1, c0 + 1

    wr = np.clip(row_f - r0, 0.0, 1.0).astype(np.float32)
    wc = np.clip(col_f - c0, 0.0, 1.0).astype(np.float32)

    return (
        (1 - wr) * (1 - wc) * field[r0, c0]
        + (1 - wr) * wc * field[r0, c1]
        + wr * (1 - wc) * field[r1, c0]
        + wr * wc * field[r1, c1]
    )


# ---------------------------------------------------------------------------
# Sky-fraction computation
# ---------------------------------------------------------------------------

def _compute_sky_fractions(
    grids: list[np.ndarray],   # [c_low, c_mid, c_high] each (N_lat, N_lon), values 0-100
    lat0: float,
    lon0: float,
    dlat: float,
    dlon: float,
    obs_lats: np.ndarray,      # (N_OBS,)
    obs_lons: np.ndarray,      # (N_OBS,)
) -> np.ndarray:
    """
    Return sky fraction (0–1) at each observer point.

    Fully vectorised: for each of N_EL elevation angles and N_AZ azimuths
    the cloud-layer sample positions for all observers are computed via
    broadcasting, yielding shape (N_OBS, N_AZ, N_EL) per layer.  The product
    over layers gives the clear-sky fraction per direction; averaging over
    directions gives the per-observer sky fraction.
    """
    N_OBS = len(obs_lats)
    mean_lat = float(np.mean(obs_lats))
    M_PER_DEG_LAT = 111_000.0
    M_PER_DEG_LON = 111_000.0 * math.cos(math.radians(mean_lat))

    # Elevation angles: equal solid-angle spacing above _MIN_EL_DEG.
    sin_min = math.sin(math.radians(_MIN_EL_DEG))
    el_rad = np.arcsin(np.linspace(sin_min, 1.0, _N_EL))   # (N_EL,)
    tan_el = np.tan(el_rad)                                  # (N_EL,)

    # Azimuth unit vectors: north=0, clockwise.
    az_rad = np.linspace(0.0, 2.0 * math.pi, _N_AZ, endpoint=False)
    sin_az = np.sin(az_rad)   # east  (N_AZ,)
    cos_az = np.cos(az_rad)   # north (N_AZ,)

    # Horizontal distance to each cloud layer at each elevation: (N_EL, N_LAYERS)
    H = np.array(_LAYER_ALTITUDES_M)          # (N_LAYERS,)
    r_m = H[None, :] / tan_el[:, None]        # (N_EL, N_LAYERS)

    # Degree offsets per direction:
    # (N_AZ, N_EL, N_LAYERS) — cos/sin are (N_AZ,) × r_m is (N_EL, N_LAYERS)
    dlat_offset = cos_az[:, None, None] * r_m[None, :, :] / M_PER_DEG_LAT
    dlon_offset = sin_az[:, None, None] * r_m[None, :, :] / M_PER_DEG_LON

    # Sample positions for all observers × azimuths × elevations × layers:
    # q_lat[obs, az, el, layer] = obs_lats[obs] + dlat_offset[az, el, layer]
    q_lat = obs_lats[:, None, None, None] + dlat_offset[None, :, :, :]   # (N_OBS, N_AZ, N_EL, N_LAYERS)
    q_lon = obs_lons[:, None, None, None] + dlon_offset[None, :, :, :]

    # Sample cloud cover (0–100) for each layer; combine into clear fraction.
    # clear_dir[obs, az, el] = product over layers of (1 − C_l / 100)
    clear_dir = np.ones((N_OBS, _N_AZ, _N_EL), dtype=np.float32)
    for l_idx, grid in enumerate(grids):
        C = _bilinear(grid, lat0, lon0, dlat, dlon, q_lat[:, :, :, l_idx], q_lon[:, :, :, l_idx])
        clear_dir *= (1.0 - C / 100.0)

    # Mean over directions (equal weight = equal solid angle)
    return clear_dir.mean(axis=(1, 2)).astype(np.float32)


# ---------------------------------------------------------------------------
# Polygon helpers
# ---------------------------------------------------------------------------

def _only_polygons(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if hasattr(geom, "geoms"):
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(parts) if parts else None
    return None


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

async def compute_cloud_filter(request: CloudFilterRequest) -> CloudFilterResult:
    import rasterio.transform
    from rasterio.features import shapes

    isochrone = shape(request.geometry)
    west, south, east, north = isochrone.bounds

    # Cloud sampling grid (isochrone bbox + buffer)
    cloud_lats = np.arange(
        north + _CLOUD_BUFFER_DEG, south - _CLOUD_BUFFER_DEG, -_CLOUD_GRID_STEP_DEG
    )
    cloud_lons = np.arange(
        west - _CLOUD_BUFFER_DEG, east + _CLOUD_BUFFER_DEG, _CLOUD_GRID_STEP_DEG
    )
    lon_g, lat_g = np.meshgrid(cloud_lons, cloud_lats)
    flat_lats = lat_g.ravel()
    flat_lons = lon_g.ravel()

    try:
        c_low_flat, c_mid_flat, c_high_flat = await _fetch_cloud_grid(flat_lats, flat_lons)
    except Exception as exc:
        raise CloudFilterError(f"Could not fetch cloud data: {exc}") from exc

    fetched_at = datetime.now(timezone.utc)

    N_lat_cloud = len(cloud_lats)
    N_lon_cloud = len(cloud_lons)
    c_low_grid = c_low_flat.reshape(N_lat_cloud, N_lon_cloud)
    c_mid_grid = c_mid_flat.reshape(N_lat_cloud, N_lon_cloud)
    c_high_grid = c_high_flat.reshape(N_lat_cloud, N_lon_cloud)

    # Observer grid over isochrone bbox (north-to-south for rasterio convention)
    obs_lats = np.arange(north, south, -_OBS_GRID_STEP_DEG)
    obs_lons = np.arange(west, east, _OBS_GRID_STEP_DEG)
    if len(obs_lats) < 2 or len(obs_lons) < 2:
        raise CloudFilterError("Isochrone bounding box is too small for cloud filter.")

    obs_lat_g, obs_lon_g = np.meshgrid(obs_lats, obs_lons, indexing="ij")

    sky_fracs = _compute_sky_fractions(
        grids=[c_low_grid, c_mid_grid, c_high_grid],
        lat0=float(cloud_lats[0]),
        lon0=float(cloud_lons[0]),
        dlat=_CLOUD_GRID_STEP_DEG,
        dlon=_CLOUD_GRID_STEP_DEG,
        obs_lats=obs_lat_g.ravel(),
        obs_lons=obs_lon_g.ravel(),
    )

    sky_grid = sky_fracs.reshape(obs_lat_g.shape)
    sky_grid_smooth = _gaussian_blur_2d(sky_grid, sigma=_SMOOTH_SIGMA_PX)
    mask = (sky_grid_smooth >= request.min_sky_fraction).astype(np.uint8)

    grid_transform = rasterio.transform.from_bounds(
        west, south, east, north,
        width=len(obs_lons),
        height=len(obs_lats),
    )
    polygons = [
        shape(geom)
        for geom, value in shapes(mask, transform=grid_transform)
        if value == 1
    ]

    if not polygons:
        return CloudFilterResult(
            min_sky_fraction=request.min_sky_fraction,
            geometry=None,
            fetched_at=fetched_at.isoformat(),
        )

    area = unary_union(polygons)
    filtered = _only_polygons(isochrone.intersection(area))

    return CloudFilterResult(
        min_sky_fraction=request.min_sky_fraction,
        geometry=mapping(filtered) if filtered else None,
        fetched_at=fetched_at.isoformat(),
    )
