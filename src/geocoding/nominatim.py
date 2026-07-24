import httpx

from app.models.bounding_box import BoundingBox
from app.models.geocoding_result import GeocodingResult
from app.models.location import Location


_BASE_URL = "https://nominatim.openstreetmap.org/search"
_USER_AGENT = "AstroSpotFinder/0.1.0"


def search(query: str, limit: int = 5) -> list[GeocodingResult]:
    params = {
        "q": query,
        "format": "json",
        "limit": limit,
    }

    with httpx.Client() as client:
        response = client.get(
            _BASE_URL,
            params=params,
            headers={"User-Agent": _USER_AGENT},
            timeout=10.0,
        )
        response.raise_for_status()

    results = []

    for item in response.json():
        try:
            results.append(GeocodingResult(
                location=Location(
                    latitude=float(item["lat"]),
                    longitude=float(item["lon"]),
                ),
                label=item["display_name"],
                bounding_box=_parse_bounding_box(
                    item.get("boundingbox")
                ),
            ))
        except (KeyError, ValueError):
            continue

    return results


def _parse_bounding_box(
    raw: object,
) -> BoundingBox | None:
    if not isinstance(raw, list) or len(raw) != 4:
        return None

    try:
        # Nominatim order: [min_lat, max_lat, min_lon, max_lon]
        return BoundingBox(
            south=float(raw[0]),
            north=float(raw[1]),
            west=float(raw[2]),
            east=float(raw[3]),
        )
    except (ValueError, TypeError):
        return None
