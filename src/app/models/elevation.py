from typing import Any

from pydantic import BaseModel, Field


class ElevationFilterRequest(BaseModel):
    geometry: dict[str, Any]
    min_elevation: int = Field(ge=0, le=8849)


class ElevationFilterResult(BaseModel):
    min_elevation: int
    geometry: dict[str, Any] | None
