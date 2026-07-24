from __future__ import annotations

from functools import reduce
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

router = APIRouter(prefix="/api/intersect", tags=["intersect"])


class IntersectRequest(BaseModel):
    geometries: list[dict[str, Any]]


class IntersectResult(BaseModel):
    geometry: dict[str, Any] | None


def _only_polygons(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if hasattr(geom, "geoms"):
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(parts) if parts else None
    return None


@router.post("", response_model=IntersectResult)
def intersect_geometries(request: IntersectRequest) -> IntersectResult:
    if len(request.geometries) < 2:
        raise HTTPException(status_code=400, detail="At least 2 geometries are required.")

    try:
        shapes = [shape(g) for g in request.geometries]
        result = reduce(lambda a, b: a.intersection(b), shapes)
        cleaned = _only_polygons(result)
        return IntersectResult(geometry=mapping(cleaned) if cleaned else None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
