from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LocalHorizonFilterRequest(BaseModel):
    geometry: dict[str, Any]
    min_sky_fraction: float = Field(ge=0.0, le=1.0)


class LocalHorizonFilterResult(BaseModel):
    min_sky_fraction: float
    geometry: dict[str, Any] | None
