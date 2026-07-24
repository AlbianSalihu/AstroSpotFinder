from pydantic import BaseModel, Field

from app.models.bounding_box import BoundingBox
from app.models.location import Location


class GeocodingResult(BaseModel):
    location: Location
    label: str = Field(min_length=1, max_length=500)
    bounding_box: BoundingBox | None = None
