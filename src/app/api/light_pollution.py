from __future__ import annotations

from collections import OrderedDict

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from app.models.light_pollution import (
    DatasetStatus,
    LightPollutionFilterRequest,
    LightPollutionFilterResult,
)
from light_pollution import dataset as lp_dataset
from light_pollution.service import LightPollutionError, compute_light_pollution_filter


router = APIRouter(
    prefix="/api/light-pollution",
    tags=["light-pollution"],
)

_GIBS_BASE = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
    "/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8"
)

# Minimal valid 1×1 transparent PNG
_TRANSPARENT_PNG = bytes([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,  # PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk length + type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # width=1, height=1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,  # 8-bit RGBA, IHDR CRC (part)
    0x89, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41,  # IHDR CRC (part), IDAT
    0x54, 0x08, 0xd7, 0x63, 0x60, 0x60, 0x60, 0x60,  # IDAT data
    0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0xa5, 0xf6,  # IDAT CRC (part)
    0x45, 0x40, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,  # IDAT CRC, IEND
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,              # IEND CRC
])

_TILE_CACHE: OrderedDict[tuple[int, int, int], bytes] = OrderedDict()
_TILE_CACHE_MAX = 512

_async_client: httpx.AsyncClient | None = None


def _get_async_client() -> httpx.AsyncClient:
    global _async_client
    if _async_client is None:
        _async_client = httpx.AsyncClient(timeout=10.0)
    return _async_client


@router.get("/status", response_model=DatasetStatus)
def get_dataset_status() -> DatasetStatus:
    return DatasetStatus(**lp_dataset.get_status())


@router.post("/download", response_model=DatasetStatus)
def trigger_download() -> DatasetStatus:
    lp_dataset.start_download()
    return DatasetStatus(**lp_dataset.get_status())


@router.post("/filter", response_model=LightPollutionFilterResult)
def filter_by_light_pollution(
    request: LightPollutionFilterRequest,
) -> LightPollutionFilterResult:
    try:
        return compute_light_pollution_filter(request)
    except LightPollutionError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error


@router.get("/overlay/{z}/{x}/{y}.png")
async def get_overlay_tile(z: int, x: int, y: int) -> Response:
    cache_key = (z, x, y)

    if cache_key in _TILE_CACHE:
        _TILE_CACHE.move_to_end(cache_key)
        return Response(content=_TILE_CACHE[cache_key], media_type="image/png")

    # MapLibre passes {z}/{x}/{y}; GIBS expects {z}/{y}/{x}
    url = f"{_GIBS_BASE}/{z}/{y}/{x}.png"

    try:
        client = _get_async_client()
        response = await client.get(url)

        if response.status_code == 404:
            return Response(content=_TRANSPARENT_PNG, media_type="image/png")

        response.raise_for_status()
        content = response.content

    except httpx.HTTPError:
        return Response(content=_TRANSPARENT_PNG, media_type="image/png")

    if len(_TILE_CACHE) >= _TILE_CACHE_MAX:
        _TILE_CACHE.popitem(last=False)

    _TILE_CACHE[cache_key] = content
    return Response(content=content, media_type="image/png")
