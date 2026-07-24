import httpx

from app.models.geocoding_result import GeocodingResult
from geocoding import nominatim


class GeocodingError(Exception):
    """Raised when the geocoding provider is unavailable."""


def search_address(
    query: str,
    limit: int = 5,
) -> list[GeocodingResult]:
    try:
        return nominatim.search(query, limit=limit)
    except httpx.HTTPError as error:
        raise GeocodingError(
            "Geocoding service is unavailable."
        ) from error
