from __future__ import annotations

import time
from collections import OrderedDict

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.cloud_cover import CloudFilterRequest, CloudFilterResult
from cloud_cover.filter_service import CloudFilterError, compute_cloud_filter
from cloud_cover.service import render_cloud_tile


router = APIRouter(
    prefix="/api/cloud-cover",
    tags=["cloud-cover"],
)

# 1×1 transparent PNG fallback
_TRANSPARENT_PNG = bytes([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0x60, 0x60, 0x60, 0x60,
    0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0xa5, 0xf6,
    0x45, 0x40, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

# (z, x, y) → (timestamp, png_bytes)
_TILE_CACHE: OrderedDict[tuple[int, int, int], tuple[float, bytes]] = OrderedDict()
_CACHE_MAX = 256
_CACHE_TTL = 1800.0  # 30 minutes — matches Open-Meteo hourly update cadence


@router.post("/filter", response_model=CloudFilterResult)
async def filter_by_cloud_cover(request: CloudFilterRequest) -> CloudFilterResult:
    try:
        return await compute_cloud_filter(request)
    except CloudFilterError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/overlay/{z}/{x}/{y}.png")
async def get_cloud_tile(z: int, x: int, y: int) -> Response:
    key = (z, x, y)
    now = time.time()

    if key in _TILE_CACHE:
        ts, data = _TILE_CACHE[key]
        if now - ts < _CACHE_TTL:
            _TILE_CACHE.move_to_end(key)
            return Response(content=data, media_type="image/png")
        del _TILE_CACHE[key]

    try:
        data = await render_cloud_tile(z, x, y)
    except Exception:
        data = _TRANSPARENT_PNG

    if len(_TILE_CACHE) >= _CACHE_MAX:
        _TILE_CACHE.popitem(last=False)

    _TILE_CACHE[key] = (now, data)
    return Response(content=data, media_type="image/png")
