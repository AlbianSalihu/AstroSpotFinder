from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DatasetStatus(BaseModel):
    available: bool
    downloaded_at: str | None
    downloading: bool
    error: str | None
    is_outdated: bool
    unit: str | None = None
    unit_label: str | None = None


class LightPollutionFilterRequest(BaseModel):
    geometry: dict[str, Any]
    max_bortle: int = Field(ge=1, le=9)


class LightPollutionFilterResult(BaseModel):
    max_bortle: int
    geometry: dict[str, Any] | None
