from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TerrainFilterRequest(BaseModel):
    geometry: dict[str, Any]
    buildup_buffer_m: int = Field(default=150, ge=0, le=2000)


class TerrainFilterResult(BaseModel):
    geometry: dict[str, Any] | None
