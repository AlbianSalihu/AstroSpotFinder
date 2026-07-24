from fastapi import APIRouter, HTTPException, status

from app.models.elevation import ElevationFilterRequest, ElevationFilterResult
from elevation.service import ElevationError, compute_elevation_filter


router = APIRouter(
    prefix="/api/elevation",
    tags=["elevation"],
)


@router.post("", response_model=ElevationFilterResult)
def filter_by_elevation(request: ElevationFilterRequest) -> ElevationFilterResult:
    try:
        return compute_elevation_filter(request)
    except ElevationError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
