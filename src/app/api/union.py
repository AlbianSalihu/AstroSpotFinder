from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

router = APIRouter(prefix="/api/union", tags=["union"])


class UnionRequest(BaseModel):
    geometries: list[dict[str, Any]]


class UnionResult(BaseModel):
    geometry: dict[str, Any] | None


@router.post("", response_model=UnionResult)
def union_geometries(request: UnionRequest) -> UnionResult:
    shapes = []
    for g in request.geometries:
        try:
            s = shape(g)
            if not s.is_empty:
                shapes.append(s)
        except Exception:
            pass

    if not shapes:
        return UnionResult(geometry=None)

    result = unary_union(shapes)
    return UnionResult(geometry=mapping(result) if not result.is_empty else None)
