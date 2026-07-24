from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.isochrone import IsochroneRequest, TransportMode
from app.models.location import Location
from routing.service import compute_isochrone

router = APIRouter(prefix="/api/walking-isochrones", tags=["walking-isochrones"])
logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=3)

# Process in small batches to stay within the public Valhalla API rate limit.
_BATCH_SIZE = 3


class WalkingIsochronesRequest(BaseModel):
    parkings: list[Location]
    minutes: int = Field(ge=1, le=60)


class WalkingIsochronesResult(BaseModel):
    isochrones: list[dict[str, Any] | None]


@router.post("", response_model=WalkingIsochronesResult)
async def compute_walking_isochrones(
    request: WalkingIsochronesRequest,
) -> WalkingIsochronesResult:
    loop = asyncio.get_event_loop()

    async def one(parking: Location) -> dict[str, Any] | None:
        try:
            result = await loop.run_in_executor(
                _executor,
                compute_isochrone,
                IsochroneRequest(
                    location=parking,
                    minutes=request.minutes,
                    mode=TransportMode.walking,
                ),
            )
            return result.geometry
        except Exception as exc:
            logger.warning(
                "Walking isochrone failed for (%.5f, %.5f): %s",
                parking.latitude,
                parking.longitude,
                exc,
            )
            return None

    results: list[dict[str, Any] | None] = []
    parkings = request.parkings
    for i in range(0, len(parkings), _BATCH_SIZE):
        batch = parkings[i : i + _BATCH_SIZE]
        batch_results = await asyncio.gather(*[one(p) for p in batch])
        results.extend(batch_results)

    return WalkingIsochronesResult(isochrones=results)
