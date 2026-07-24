"""
Downloads Copernicus DEM GLO-30 tiles (30 m resolution) from the AWS Open Data
registry. Tiles are 1°×1° GeoTIFFs in WGS84 (EPSG:4326), publicly accessible
with no API key required.
"""
from __future__ import annotations

import math
from pathlib import Path

import httpx

from app.paths import DATA_DIRECTORY


_CACHE_DIR = DATA_DIRECTORY / "elevation_cache"
_BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"


def _tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def fetch_tiles(
    south: float,
    west: float,
    north: float,
    east: float,
) -> list[Path]:
    """
    Return local paths for all Copernicus DEM tiles that cover the bbox.
    Missing ocean/void tiles (HTTP 404) are silently skipped.
    """
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)

    lat_range = range(math.floor(south), math.floor(north) + 1)
    lon_range = range(math.floor(west), math.floor(east) + 1)

    paths: list[Path] = []

    with httpx.Client(timeout=60.0) as client:
        for lat in lat_range:
            for lon in lon_range:
                name = _tile_name(lat, lon)
                cache_path = _CACHE_DIR / f"{name}.tif"

                if not cache_path.exists():
                    url = f"{_BASE_URL}/{name}/{name}.tif"
                    response = client.get(url)

                    if response.status_code == 404:
                        continue

                    response.raise_for_status()
                    cache_path.write_bytes(response.content)

                paths.append(cache_path)

    return paths
