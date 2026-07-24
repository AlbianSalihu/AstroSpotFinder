"""
Terrain openness filter using ESA WorldCover 2021 v200 (10 m resolution).

Reads Cloud-Optimized GeoTIFF tiles directly from the ESA public S3 bucket
via GDAL's /vsicurl/ driver — only the pixels covering the input geometry
are fetched (HTTP range requests).

Excluded classes:
  10  Trees        — exact pixel boundary
  20  Shrubs       — exact pixel boundary
  50  Built-up     — dilated by _BUILDUP_BUFFER_M (default 150 m) so areas
                     close to habitations are also removed
  95  Mangroves    — exact pixel boundary

All other classes (grassland, cropland, bare rock, water, wetland …) are
considered open and are kept in the output geometry.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.merge import merge
from scipy.ndimage import binary_dilation
from shapely.geometry import mapping, shape
from shapely.ops import unary_union


_BASE_URL = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com"
    "/v200/2021/map"
)

_PIXEL_SIZE_M = 10  # WorldCover resolution

# Classes excluded at exact pixel boundary (no dilation).
_EXCLUDED_EXACT: frozenset[int] = frozenset([10, 20, 95])
# Built-up class gets the dilation treatment.
_BUILDUP_CLASS = 50


def _buildup_disk(buffer_m: int) -> np.ndarray:
    r = max(buffer_m // _PIXEL_SIZE_M, 0)
    if r == 0:
        return np.ones((1, 1), dtype=bool)
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    return (x ** 2 + y ** 2) <= r ** 2


class TerrainFilterError(Exception):
    """Raised when WorldCover data cannot be fetched or processed."""


def _tile_id(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}"


def _tile_url(lat: int, lon: int) -> str:
    tid = _tile_id(lat, lon)
    return f"{_BASE_URL}/ESA_WorldCover_10m_2021_v200_{tid}_Map.tif"


def _only_polygons(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if hasattr(geom, "geoms"):
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(parts) if parts else None
    return None


def compute_terrain_filter(
    geometry: dict[str, Any],
    buildup_buffer_m: int = 150,
) -> dict[str, Any] | None:
    """
    Return the subset of *geometry* that lies on open terrain.

    Raises TerrainFilterError if WorldCover data cannot be retrieved.
    """
    isochrone = shape(geometry)
    west, south, east, north = isochrone.bounds

    # Collect the 3°×3° WorldCover tiles that overlap the bounding box.
    lat_starts = range(
        math.floor(south / 3) * 3,
        math.ceil(north / 3) * 3,
        3,
    )
    lon_starts = range(
        math.floor(west / 3) * 3,
        math.ceil(east / 3) * 3,
        3,
    )

    datasets: list[rasterio.DatasetReader] = []
    for lat in lat_starts:
        for lon in lon_starts:
            url = f"/vsicurl/{_tile_url(lat, lon)}"
            try:
                datasets.append(rasterio.open(url))
            except Exception:
                continue

    if not datasets:
        raise TerrainFilterError(
            "No WorldCover data available for this area."
        )

    # Pad the read window by at least the built-up dilation radius so that
    # built-up pixels just outside the geometry boundary still get dilated
    # inward correctly.  150 m ≈ 0.00135° at mid-latitudes; use 0.002° (~220 m).
    pad = 0.002
    try:
        if len(datasets) == 1:
            ds = datasets[0]
            window = rasterio.windows.from_bounds(
                west - pad, south - pad, east + pad, north + pad,
                transform=ds.transform,
            )
            data = ds.read(1, window=window).astype(np.uint8)
            transform = ds.window_transform(window)
        else:
            merged, transform = merge(
                datasets,
                bounds=(west - pad, south - pad, east + pad, north + pad),
            )
            data = merged[0].astype(np.uint8)
    except Exception as exc:
        raise TerrainFilterError(
            f"Failed to read WorldCover tile: {exc}"
        ) from exc
    finally:
        for ds in datasets:
            ds.close()

    # Built-up pixels dilated by buildup_buffer_m so nearby habitations are also excluded.
    buildup = data == _BUILDUP_CLASS
    if buildup.any() and buildup_buffer_m > 0:
        buildup = binary_dilation(buildup, structure=_buildup_disk(buildup_buffer_m))

    # Combine: built-up (dilated) + other excluded classes at exact boundary.
    excluded = buildup
    for cls in _EXCLUDED_EXACT:
        excluded = excluded | (data == cls)

    mask = (~excluded).astype(np.uint8)

    open_polygons = [
        shape(geom)
        for geom, value in shapes(mask, transform=transform)
        if value == 1
    ]

    if not open_polygons:
        return None

    open_area = unary_union(open_polygons)
    filtered = _only_polygons(isochrone.intersection(open_area))
    return mapping(filtered) if filtered else None
