from __future__ import annotations

import httpx
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.merge import merge
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from app.models.elevation import ElevationFilterRequest, ElevationFilterResult
from elevation import copernicus


class ElevationError(Exception):
    """Raised when elevation data cannot be fetched or processed."""


def _expand_bbox(
    south: float,
    west: float,
    north: float,
    east: float,
    factor: float = 1.5,
) -> tuple[float, float, float, float]:
    cx = (west + east) / 2
    cy = (south + north) / 2
    hw = (east - west) / 2 * factor
    hh = (north - south) / 2 * factor
    return cy - hh, cx - hw, cy + hh, cx + hw


def _only_polygons(geom):
    """Return a Polygon/MultiPolygon from any geometry, discarding non-area parts."""
    if geom is None or geom.is_empty:
        return None

    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom

    if hasattr(geom, "geoms"):
        parts = [
            g for g in geom.geoms
            if g.geom_type in ("Polygon", "MultiPolygon")
        ]

        if not parts:
            return None

        return unary_union(parts)

    return None


def compute_elevation_filter(
    request: ElevationFilterRequest,
) -> ElevationFilterResult:
    try:
        isochrone = shape(request.geometry)
        west, south, east, north = isochrone.bounds

        exp_south, exp_west, exp_north, exp_east = _expand_bbox(
            south, west, north, east
        )

        tile_paths = copernicus.fetch_tiles(exp_south, exp_west, exp_north, exp_east)

        if not tile_paths:
            raise ElevationError(
                "No elevation data is available for this area."
            )

        datasets = [rasterio.open(p) for p in tile_paths]

        try:
            if len(datasets) == 1:
                ds = datasets[0]
                elevation = ds.read(1).astype(np.float32)
                transform = ds.transform
                nodata = ds.nodata
            else:
                merged, transform = merge(datasets)
                elevation = merged[0].astype(np.float32)
                nodata = datasets[0].nodata
        finally:
            for ds in datasets:
                ds.close()

        # Build mask: 1 = at or above threshold, 0 = below or nodata
        mask = (elevation >= request.min_elevation).astype(np.uint8)

        if nodata is not None:
            mask[elevation == nodata] = 0

        high_polygons = [
            shape(geom)
            for geom, value in shapes(mask, transform=transform)
            if value == 1
        ]

        if not high_polygons:
            return ElevationFilterResult(
                min_elevation=request.min_elevation,
                geometry=None,
            )

        high_area = unary_union(high_polygons)
        filtered = _only_polygons(isochrone.intersection(high_area))

        if filtered is None:
            return ElevationFilterResult(
                min_elevation=request.min_elevation,
                geometry=None,
            )

        return ElevationFilterResult(
            min_elevation=request.min_elevation,
            geometry=mapping(filtered),
        )

    except httpx.HTTPError as error:
        raise ElevationError(
            "Elevation tiles could not be downloaded."
        ) from error
