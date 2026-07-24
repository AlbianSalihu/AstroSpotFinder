import httpx

from app.models.isochrone import IsochroneRequest, IsochroneResult, TransportMode


_BASE_URL = "https://valhalla1.openstreetmap.de/isochrone"
_USER_AGENT = "AstroSpotFinder/0.1.0"

_COSTING: dict[TransportMode, str] = {
    TransportMode.driving: "auto",
    TransportMode.walking: "pedestrian",
}


def compute(request: IsochroneRequest) -> IsochroneResult:
    body = {
        "locations": [{
            "lat": request.location.latitude,
            "lon": request.location.longitude,
        }],
        "costing": _COSTING[request.mode],
        "contours": [{"time": request.minutes}],
        "polygons": True,
    }

    with httpx.Client() as client:
        response = client.post(
            _BASE_URL,
            json=body,
            headers={"User-Agent": _USER_AGENT},
            timeout=30.0,
        )
        response.raise_for_status()

    features = response.json().get("features", [])

    if not features:
        raise RuntimeError(
            "Valhalla returned no isochrone features."
        )

    geometry = features[0].get("geometry")

    if not geometry:
        raise RuntimeError(
            "Valhalla returned a feature with no geometry."
        )

    return IsochroneResult(
        mode=request.mode,
        minutes=request.minutes,
        geometry=geometry,
    )
