import httpx

from app.models.isochrone import IsochroneRequest, IsochroneResult
from routing import valhalla


class IsochroneError(Exception):
    """Raised when the isochrone provider is unavailable."""


def compute_isochrone(
    request: IsochroneRequest,
) -> IsochroneResult:
    try:
        return valhalla.compute(request)
    except httpx.HTTPError as error:
        raise IsochroneError(
            "Isochrone service is unavailable."
        ) from error
    except RuntimeError as error:
        raise IsochroneError(str(error)) from error
