from fastapi import APIRouter, HTTPException, status

from app.models.horizon import HorizonFilterRequest, HorizonFilterResult
from horizon.service import HorizonError, compute_horizon_filter


router = APIRouter(
    prefix="/api/horizon",
    tags=["horizon"],
)


@router.post("", response_model=HorizonFilterResult)
def filter_by_horizon(request: HorizonFilterRequest) -> HorizonFilterResult:
    try:
        return compute_horizon_filter(request)
    except HorizonError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
