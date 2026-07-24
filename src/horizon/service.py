"""
Terrain horizon analysis using Copernicus DEM GLO-30 (30 m resolution).

Algorithm overview
------------------
For every observer point on a regular grid covering the isochrone, the sky
fraction is computed as follows:

1. **Ray-casting**: cast N_AZ = 32 rays from the observer, evenly spaced at
   11.25° intervals covering all azimuths (0–360°).

2. **Horizon elevation angle**: along each ray, sample terrain elevation at
   logarithmically spaced distances up to MAX_RADIUS_M = 20 km.  The maximum
   elevation angle seen along a ray in azimuth α is:

       h(α) = max  arctan( (elev_terrain − elev_observer) / d )
               d

   Only positive angles count; terrain *below* the observer cannot block sky.

3. **Sky fraction**: the visible fraction of the celestial hemisphere is:

       F = 1 − (1/N_AZ) × Σ sin(h(α_i))

   Derivation: the solid angle of sky visible above a horizon of elevation h
   in one azimuth strip is proportional to ∫_{h}^{π/2} cos(el) d(el) = 1 − sin(h).
   Averaging over all azimuths and normalising to the full hemisphere gives
   F = 1 − mean(sin(h_i)).

   For a perfectly flat horizon (h = 0° everywhere): F = 1.0.
   For a uniform 20° mountain ring: F = 1 − sin 20° ≈ 0.66.

4. **Filter polygon**: the sky fraction raster is thresholded at
   min_sky_fraction, vectorised with rasterio, and intersected with the
   isochrone polygon — identical to the elevation and light-pollution
   filter pipeline.

The per-azimuth horizon profile h(α) produced here is also the data
structure needed for future astronomical target visibility: given a target
at azimuth α and altitude β, it is visible if and only if β > h(α).
"""
from __future__ import annotations

import math

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.merge import merge
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from app.models.horizon import HorizonFilterRequest, HorizonFilterResult
from elevation import copernicus

# Logarithmically spaced distance samples per ray.
# We start at MIN_RADIUS_M (not 1 pixel) because the Copernicus GLO-30 is a DSM
# (Digital Surface Model) that includes vegetation and buildings.  At 30 m resolution
# a single tree pixel at 30 m distance creates a 34° false horizon angle that completely
# dominates the sky-fraction calculation in flat forested terrain.  At 500 m, a 20 m
# tree contributes only arctan(20/500) ≈ 2.3°, which is negligible.  For astronomy,
# obstacles within 500 m are local nuisances that can be avoided on the night;
# the horizon that matters is the terrain 1–20 km away.
_N_DIST_SAMPLES = 20
_MIN_RADIUS_M = 500      # metres — ignore terrain closer than this (DSM artifacts)
_MAX_RADIUS_M = 20_000   # metres — beyond this, terrain effects are negligible
_N_AZ = 16               # azimuths (22.5° spacing); 16 vs 32 changes mean sky-fraction by <0.1 %
_GRID_STEP_DEG = 0.001   # observer grid spacing (~100 m at mid-latitudes)
_HORIZON_BUFFER_DEG = 0.20  # bbox expansion for DEM fetch (~22 km)

# Local-horizon parameters: short range to capture buildings/trees rather
# than distant terrain.  Min radius starts at 10 m so a wall 10 m away is
# detected; max radius 500 m captures the treeline around a clearing.
_LOCAL_MIN_RADIUS_M = 10
_LOCAL_MAX_RADIUS_M = 500
_LOCAL_N_AZ = 32           # twice as many azimuths for local precision
_LOCAL_N_DIST_SAMPLES = 15
_LOCAL_GRID_STEP_DEG = 0.0005   # ~55 m grid — finer than macro horizon
_LOCAL_BUFFER_DEG = 0.006        # ~700 m DEM buffer — enough for 500 m rays


class HorizonError(Exception):
    """Raised when horizon data cannot be fetched or processed."""


def _only_polygons(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if hasattr(geom, "geoms"):
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(parts) if parts else None
    return None


def _compute_sky_fractions(
    dem: np.ndarray,
    transform: rasterio.transform.Affine,
    obs_lats: np.ndarray,
    obs_lons: np.ndarray,
) -> np.ndarray:
    """
    Return sky fraction (0–1) for each (lat, lon) observer point.

    Inner loop is over distances only (N_DIST_SAMPLES iterations).  For each
    distance, all observers × all azimuths are processed simultaneously as a
    2-D numpy array of shape (N_OBS, N_AZ), giving O(N_DIST × N_OBS × N_AZ)
    total array reads with minimal Python overhead.
    """
    H, W = dem.shape

    mean_lat = float(np.mean(obs_lats))
    px_size_lon_m = abs(transform.a) * 111_000 * math.cos(math.radians(mean_lat))
    px_size_lat_m = abs(transform.e) * 111_000
    px_size_m = (px_size_lon_m + px_size_lat_m) / 2.0

    min_radius_px = max(1, int(_MIN_RADIUS_M / px_size_m))
    max_radius_px = max(min_radius_px + 1, int(_MAX_RADIUS_M / px_size_m))

    # Observer pixel coordinates.
    # Copernicus DEM tiles are standard north-up rasters (b = d = 0):
    #   col = (lon − c) / a        row = (lat − f) / e
    obs_cols = np.round((obs_lons - transform.c) / transform.a).astype(np.int32)
    obs_rows = np.round((obs_lats - transform.f) / transform.e).astype(np.int32)

    valid_obs = (obs_rows >= 0) & (obs_rows < H) & (obs_cols >= 0) & (obs_cols < W)
    obs_elev = np.where(
        valid_obs,
        dem[np.clip(obs_rows, 0, H - 1), np.clip(obs_cols, 0, W - 1)],
        0.0,
    ).astype(np.float32)   # (N_OBS,)

    # Azimuth pixel-offset unit vectors: shape (N_AZ,).
    azimuths = np.linspace(0.0, 2.0 * math.pi, _N_AZ, endpoint=False)
    sin_az = np.sin(azimuths).astype(np.float32)   # east component
    cos_az = np.cos(azimuths).astype(np.float32)   # north component

    # Log-spaced distances, starting beyond the DSM-artifact radius.
    dist_px = np.unique(
        np.round(np.geomspace(min_radius_px, max_radius_px, _N_DIST_SAMPLES)).astype(np.int32)
    )
    dist_m = (dist_px * px_size_m).astype(np.float32)

    # max_angles[obs_idx, az_idx]: highest terrain elevation angle seen (radians).
    max_angles = np.zeros((len(obs_lats), _N_AZ), dtype=np.float32)

    for d_px_val, d_m_val in zip(dist_px, dist_m):
        # Pixel offsets for every azimuth at this distance: shape (N_AZ,).
        dr = np.round(-cos_az * d_px_val).astype(np.int32)
        dc = np.round(sin_az * d_px_val).astype(np.int32)

        # Sample rows/cols for every observer × azimuth: shape (N_OBS, N_AZ).
        s_rows = obs_rows[:, None] + dr[None, :]
        s_cols = obs_cols[:, None] + dc[None, :]

        in_bounds = (s_rows >= 0) & (s_rows < H) & (s_cols >= 0) & (s_cols < W)

        terrain_elev = np.where(
            in_bounds,
            dem[np.clip(s_rows, 0, H - 1), np.clip(s_cols, 0, W - 1)],
            obs_elev[:, None],   # out-of-DEM → same elevation as observer → 0° angle
        )

        angle = np.arctan2(terrain_elev - obs_elev[:, None], d_m_val)
        np.maximum(max_angles, angle, out=max_angles)

    # Negative angles (terrain below observer) cannot block sky.
    np.maximum(max_angles, 0.0, out=max_angles)

    # Sky fraction: F = 1 − mean(sin(h_i))
    return (1.0 - np.mean(np.sin(max_angles), axis=1)).astype(np.float32)


def compute_horizon_filter(request: HorizonFilterRequest) -> HorizonFilterResult:
    isochrone = shape(request.geometry)
    west, south, east, north = isochrone.bounds

    exp_south = south - _HORIZON_BUFFER_DEG
    exp_north = north + _HORIZON_BUFFER_DEG
    exp_west = west - _HORIZON_BUFFER_DEG
    exp_east = east + _HORIZON_BUFFER_DEG

    tile_paths = copernicus.fetch_tiles(exp_south, exp_west, exp_north, exp_east)
    if not tile_paths:
        raise HorizonError("No elevation data available for this area.")

    datasets = [rasterio.open(p) for p in tile_paths]
    try:
        if len(datasets) == 1:
            ds = datasets[0]
            dem = ds.read(1).astype(np.float32)
            dem_transform = ds.transform
            nodata = ds.nodata
        else:
            merged, dem_transform = merge(datasets)
            dem = merged[0].astype(np.float32)
            nodata = datasets[0].nodata
    finally:
        for ds in datasets:
            ds.close()

    if nodata is not None:
        dem[dem == nodata] = 0.0

    # Observer grid over the isochrone bounding box.
    # Latitudes go north-to-south to match rasterio's row-0 = north convention.
    obs_lats = np.arange(north, south, -_GRID_STEP_DEG)
    obs_lons = np.arange(west, east, _GRID_STEP_DEG)

    if len(obs_lats) < 2 or len(obs_lons) < 2:
        raise HorizonError("Isochrone bounding box is too small for horizon analysis.")

    lat_grid, lon_grid = np.meshgrid(obs_lats, obs_lons, indexing="ij")

    sky_fracs = _compute_sky_fractions(
        dem=dem,
        transform=dem_transform,
        obs_lats=lat_grid.ravel(),
        obs_lons=lon_grid.ravel(),
    )

    sky_grid = sky_fracs.reshape(lat_grid.shape)
    mask = (sky_grid >= request.min_sky_fraction).astype(np.uint8)

    # Transform for the observer grid (row 0 = north, last row ≈ south).
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
        return HorizonFilterResult(
            min_sky_fraction=request.min_sky_fraction,
            geometry=None,
        )

    area = unary_union(polygons)
    filtered = _only_polygons(isochrone.intersection(area))

    return HorizonFilterResult(
        min_sky_fraction=request.min_sky_fraction,
        geometry=mapping(filtered) if filtered else None,
    )


def compute_local_horizon_filter(
    geometry: dict,
    min_sky_fraction: float,
) -> dict | None:
    """
    Like compute_horizon_filter but tuned for immediate surroundings (0–500 m).

    Uses the same Copernicus GLO-30 DSM so buildings and tree clumps appear as
    horizon obstacles (the macro filter intentionally ignores them by starting
    rays at 500 m; here we start at 10 m).
    """
    isochrone = shape(geometry)
    west, south, east, north = isochrone.bounds

    exp_south = south - _LOCAL_BUFFER_DEG
    exp_north = north + _LOCAL_BUFFER_DEG
    exp_west = west - _LOCAL_BUFFER_DEG
    exp_east = east + _LOCAL_BUFFER_DEG

    tile_paths = copernicus.fetch_tiles(exp_south, exp_west, exp_north, exp_east)
    if not tile_paths:
        raise HorizonError("No elevation data available for this area.")

    datasets = [rasterio.open(p) for p in tile_paths]
    try:
        if len(datasets) == 1:
            ds = datasets[0]
            dem = ds.read(1).astype(np.float32)
            dem_transform = ds.transform
            nodata = ds.nodata
        else:
            merged, dem_transform = merge(datasets)
            dem = merged[0].astype(np.float32)
            nodata = datasets[0].nodata
    finally:
        for ds in datasets:
            ds.close()

    if nodata is not None:
        dem[dem == nodata] = 0.0

    obs_lats = np.arange(north, south, -_LOCAL_GRID_STEP_DEG)
    obs_lons = np.arange(west, east, _LOCAL_GRID_STEP_DEG)

    if len(obs_lats) < 2 or len(obs_lons) < 2:
        raise HorizonError("Geometry bounding box is too small for local horizon analysis.")

    lat_grid, lon_grid = np.meshgrid(obs_lats, obs_lons, indexing="ij")

    # Reuse _compute_sky_fractions but with local parameters injected via a
    # temporary override of the module-level constants.
    sky_fracs = _compute_sky_fractions_local(
        dem=dem,
        transform=dem_transform,
        obs_lats=lat_grid.ravel(),
        obs_lons=lon_grid.ravel(),
    )

    sky_grid = sky_fracs.reshape(lat_grid.shape)
    mask = (sky_grid >= min_sky_fraction).astype(np.uint8)

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
        return None

    area = unary_union(polygons)
    filtered = _only_polygons(isochrone.intersection(area))
    return mapping(filtered) if filtered else None


def _compute_sky_fractions_local(
    dem: np.ndarray,
    transform: rasterio.transform.Affine,
    obs_lats: np.ndarray,
    obs_lons: np.ndarray,
) -> np.ndarray:
    """Sky fractions using local-horizon parameters (10 m – 500 m range)."""
    import math as _math
    H, W = dem.shape

    mean_lat = float(np.mean(obs_lats))
    px_size_lon_m = abs(transform.a) * 111_000 * _math.cos(_math.radians(mean_lat))
    px_size_lat_m = abs(transform.e) * 111_000
    px_size_m = (px_size_lon_m + px_size_lat_m) / 2.0

    min_radius_px = max(1, int(_LOCAL_MIN_RADIUS_M / px_size_m))
    max_radius_px = max(min_radius_px + 1, int(_LOCAL_MAX_RADIUS_M / px_size_m))

    obs_cols = np.round((obs_lons - transform.c) / transform.a).astype(np.int32)
    obs_rows = np.round((obs_lats - transform.f) / transform.e).astype(np.int32)

    valid_obs = (obs_rows >= 0) & (obs_rows < H) & (obs_cols >= 0) & (obs_cols < W)
    obs_elev = np.where(
        valid_obs,
        dem[np.clip(obs_rows, 0, H - 1), np.clip(obs_cols, 0, W - 1)],
        0.0,
    ).astype(np.float32)

    azimuths = np.linspace(0.0, 2.0 * _math.pi, _LOCAL_N_AZ, endpoint=False)
    sin_az = np.sin(azimuths).astype(np.float32)
    cos_az = np.cos(azimuths).astype(np.float32)

    dist_px = np.unique(
        np.round(
            np.geomspace(min_radius_px, max_radius_px, _LOCAL_N_DIST_SAMPLES)
        ).astype(np.int32)
    )
    dist_m = (dist_px * px_size_m).astype(np.float32)

    max_angles = np.zeros((len(obs_lats), _LOCAL_N_AZ), dtype=np.float32)

    for d_px_val, d_m_val in zip(dist_px, dist_m):
        dr = np.round(-cos_az * d_px_val).astype(np.int32)
        dc = np.round(sin_az * d_px_val).astype(np.int32)

        s_rows = obs_rows[:, None] + dr[None, :]
        s_cols = obs_cols[:, None] + dc[None, :]

        in_bounds = (s_rows >= 0) & (s_rows < H) & (s_cols >= 0) & (s_cols < W)

        terrain_elev = np.where(
            in_bounds,
            dem[np.clip(s_rows, 0, H - 1), np.clip(s_cols, 0, W - 1)],
            obs_elev[:, None],
        )

        angle = np.arctan2(terrain_elev - obs_elev[:, None], d_m_val)
        np.maximum(max_angles, angle, out=max_angles)

    np.maximum(max_angles, 0.0, out=max_angles)
    return (1.0 - np.mean(np.sin(max_angles), axis=1)).astype(np.float32)
