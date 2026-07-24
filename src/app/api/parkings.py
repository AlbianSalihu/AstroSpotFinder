from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shapely.geometry import MultiPolygon, Point, Polygon, shape

router = APIRouter(prefix="/api/parkings", tags=["parkings"])

# Primary + fallback Overpass mirrors, tried in order.
_OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
]

# Max vertices for the Overpass poly: filter; simplify if above this.
_MAX_POLY_VERTICES = 200


class ParkingsRequest(BaseModel):
    geometry: dict[str, Any]


class ParkingSpot(BaseModel):
    osm_id: str
    name: str | None
    lat: float
    lon: float
    access: str | None
    fee: str | None


class ParkingsResult(BaseModel):
    parkings: list[ParkingSpot]


def _simplify_to_poly_string(poly: Polygon) -> str:
    """Simplify a polygon to ≤ _MAX_POLY_VERTICES and return Overpass poly: string."""
    coords = list(poly.exterior.coords)
    if len(coords) > _MAX_POLY_VERTICES:
        for tol in (0.001, 0.005, 0.01, 0.05):
            simplified = poly.simplify(tol, preserve_topology=True)
            if simplified.geom_type != "Polygon":
                simplified = simplified.convex_hull
            coords = list(simplified.exterior.coords)
            if len(coords) <= _MAX_POLY_VERTICES:
                break
        else:
            coords = list(poly.convex_hull.exterior.coords)
    return " ".join(f"{lat:.5f} {lon:.5f}" for lon, lat in coords)


def _poly_filter_strings(geom: Polygon | MultiPolygon) -> list[str]:
    """
    Return one Overpass poly: string per polygon part.

    Tiny fragments (< 0.0001 sq°, roughly < 1 km²) are skipped since they
    are unlikely to contain parking spots and would bloat the query.
    """
    polygons: list[Polygon] = (
        [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    )
    return [
        _simplify_to_poly_string(p)
        for p in polygons
        if p.area >= 0.0001
    ] or [_simplify_to_poly_string(max(polygons, key=lambda p: p.area))]


def _build_query(poly_strings: list[str]) -> str:
    # Each polygon part gets its own node/way/relation clause; Overpass unions them.
    clauses = "".join(
        f'node["amenity"="parking"](poly:"{ps}");'
        f'way["amenity"="parking"](poly:"{ps}");'
        f'relation["amenity"="parking"](poly:"{ps}");'
        for ps in poly_strings
    )
    return f'[out:json][timeout:55];({clauses});out center 2000;'


def _parse_element(el: dict) -> ParkingSpot | None:
    tags = el.get("tags", {})

    access = tags.get("access")
    if access in ("private", "no"):
        return None

    if el["type"] == "node":
        lat, lon = el["lat"], el["lon"]
    elif el["type"] in ("way", "relation"):
        center = el.get("center")
        if not center:
            return None
        lat, lon = center["lat"], center["lon"]
    else:
        return None

    return ParkingSpot(
        osm_id=f"{el['type']}/{el['id']}",
        name=tags.get("name"),
        lat=lat,
        lon=lon,
        access=access,
        fee=tags.get("fee"),
    )


@router.post("", response_model=ParkingsResult)
async def find_parkings(request: ParkingsRequest) -> ParkingsResult:
    try:
        geom = shape(request.geometry)
        poly_strings = _poly_filter_strings(geom)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid geometry: {exc}") from exc

    query = _build_query(poly_strings)
    headers = {"Accept": "*/*", "User-Agent": "AstroSpotFinder/1.0"}

    last_exc: Exception | None = None
    for url in _OVERPASS_URLS:
        try:
            async with httpx.AsyncClient(timeout=65.0) as client:
                response = await client.post(url, data={"data": query}, headers=headers)
                response.raise_for_status()
                data = response.json()
            break
        except Exception as exc:
            last_exc = exc
            continue
    else:
        raise HTTPException(
            status_code=502,
            detail=f"Overpass API error: {last_exc}",
        )

    seen: set[str] = set()
    parkings = []
    for el in data.get("elements", []):
        spot = _parse_element(el)
        if spot is None or spot.osm_id in seen:
            continue
        if not geom.covers(Point(spot.lon, spot.lat)):
            continue
        seen.add(spot.osm_id)
        parkings.append(spot)

    return ParkingsResult(parkings=parkings)
