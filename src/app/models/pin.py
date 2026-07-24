from pydantic import BaseModel, Field

from app.models.location import Location


class Pin(BaseModel):
    id: str = Field(
        min_length=1,
        max_length=200,
    )

    location: Location

    source: str = Field(
        default="unknown",
        min_length=1,
        max_length=100,
    )

    label: str | None = Field(
        default=None,
        max_length=500,
    )


class PinUpdate(BaseModel):
    label: str | None = Field(
        default=None,
        max_length=500,
    )
