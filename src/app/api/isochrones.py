from fastapi import APIRouter, HTTPException, status

from app.models.isochrone import IsochroneRequest, IsochroneResult
from routing.service import IsochroneError, compute_isochrone


router = APIRouter(
    prefix="/api/isochrones",
    tags=["isochrones"],
)


@router.post(
    "",
    response_model=IsochroneResult,
)
def compute(request: IsochroneRequest) -> IsochroneResult:
    try:
        return compute_isochrone(request)
    except IsochroneError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
