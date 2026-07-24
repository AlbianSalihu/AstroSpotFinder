from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.models.location import Location


class TransportMode(str, Enum):
    driving = "driving"
    walking = "walking"


class IsochroneRequest(BaseModel):
    location: Location
    minutes: int = Field(ge=1, le=120)
    mode: TransportMode


class IsochroneResult(BaseModel):
    mode: TransportMode
    minutes: int
    geometry: dict[str, Any]
