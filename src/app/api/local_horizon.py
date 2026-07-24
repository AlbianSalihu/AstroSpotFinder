from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.local_horizon import LocalHorizonFilterRequest, LocalHorizonFilterResult
from horizon.service import HorizonError, compute_local_horizon_filter

router = APIRouter(prefix="/api/local-horizon", tags=["local-horizon"])


@router.post("/filter", response_model=LocalHorizonFilterResult)
def filter_by_local_horizon(
    request: LocalHorizonFilterRequest,
) -> LocalHorizonFilterResult:
    try:
        geometry = compute_local_horizon_filter(
            request.geometry,
            request.min_sky_fraction,
        )
        return LocalHorizonFilterResult(
            min_sky_fraction=request.min_sky_fraction,
            geometry=geometry,
        )
    except HorizonError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
