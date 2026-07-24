from __future__ import annotations

import numpy as np
import rasterio
from rasterio.features import shapes
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from app.models.light_pollution import LightPollutionFilterRequest, LightPollutionFilterResult
from light_pollution.dataset import DATASET_PATH


class LightPollutionError(Exception):
    """Raised when light pollution data cannot be read or processed."""


# Thresholds in nW/cm²/sr for VIIRS VNL median-masked data.
# Based on calibrations mapping VIIRS radiance to Bortle / SQM observations.
BORTLE_THRESHOLDS: dict[int, float] = {
    1: 0.25,
    2: 1.0,
    3: 2.0,
    4: 5.0,
    5: 10.0,
    6: 20.0,
    7: 50.0,
    8: 150.0,
    9: 1e6,
}


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


def compute_light_pollution_filter(
    request: LightPollutionFilterRequest,
) -> LightPollutionFilterResult:
    if not DATASET_PATH.exists():
        raise LightPollutionError("Dataset not available. Download it first.")

    threshold = BORTLE_THRESHOLDS[request.max_bortle]

    isochrone = shape(request.geometry)
    west, south, east, north = isochrone.bounds

    with rasterio.open(DATASET_PATH) as ds:
        # Pad the window by 2 pixels on every side so that raster cells at the
        # boundary of the input geometry are always included.  Without padding,
        # a small walking-union bounding box and the original large car-isochrone
        # bounding box produce different raster windows, causing border cells to
        # flip in/out of the dark-polygon set inconsistently.
        pad_x = abs(ds.transform.a) * 2
        pad_y = abs(ds.transform.e) * 2
        window = rasterio.windows.from_bounds(
            west - pad_x, south - pad_y, east + pad_x, north + pad_y,
            transform=ds.transform,
        )
        data = ds.read(1, window=window).astype(np.float32)
        transform = ds.window_transform(window)
        nodata = ds.nodata

    mask = ((data <= threshold) & (data > 0)).astype(np.uint8)

    if nodata is not None:
        mask[data == nodata] = 0

    dark_polygons = [
        shape(geom)
        for geom, value in shapes(mask, transform=transform)
        if value == 1
    ]

    if not dark_polygons:
        return LightPollutionFilterResult(
            max_bortle=request.max_bortle,
            geometry=None,
        )

    dark_area = unary_union(dark_polygons)
    filtered = _only_polygons(isochrone.intersection(dark_area))

    if filtered is None:
        return LightPollutionFilterResult(
            max_bortle=request.max_bortle,
            geometry=None,
        )

    return LightPollutionFilterResult(
        max_bortle=request.max_bortle,
        geometry=mapping(filtered),
    )
