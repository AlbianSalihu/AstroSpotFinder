from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.world_cover import TerrainFilterRequest, TerrainFilterResult
from world_cover.service import TerrainFilterError, compute_terrain_filter

router = APIRouter(prefix="/api/terrain-filter", tags=["terrain-filter"])


@router.post("", response_model=TerrainFilterResult)
def filter_by_terrain(request: TerrainFilterRequest) -> TerrainFilterResult:
    try:
        geometry = compute_terrain_filter(request.geometry, buildup_buffer_m=request.buildup_buffer_m)
        return TerrainFilterResult(geometry=geometry)
    except TerrainFilterError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
