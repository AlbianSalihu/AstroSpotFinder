from fastapi import APIRouter, HTTPException, Query, status

from app.models.geocoding_result import GeocodingResult
from geocoding.service import GeocodingError, search_address


router = APIRouter(
    prefix="/api/geocode",
    tags=["geocoding"],
)


@router.get(
    "",
    response_model=list[GeocodingResult],
)
def geocode(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=5, ge=1, le=10),
) -> list[GeocodingResult]:
    try:
        return search_address(q, limit=limit)
    except GeocodingError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Geocoding service is unavailable.",
        ) from error
