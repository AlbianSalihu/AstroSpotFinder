from __future__ import annotations

import asyncio
import math
from io import BytesIO

import httpx
from PIL import Image

_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Clear (0%) → transparent; overcast (100%) → white cloud colour
_CLOUD_RGB = (220, 225, 240)
_ALPHA_OVERCAST = 185


def _tile_to_bbox(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Convert tile coordinates to (west, south, east, north) in degrees."""
    n = 2 ** z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return west, south, east, north


def _grid_size(z: int) -> int:
    return 4  # source capped at maxzoom 5; 4×4 = 16 API calls per tile


async def _fetch_cloud_cover(
    client: httpx.AsyncClient,
    lat: float,
    lon: float,
) -> float:
    try:
        response = await client.get(
            _OPEN_METEO_URL,
            params={
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "current": "cloud_cover",
                "timeformat": "unixtime",
            },
        )
        response.raise_for_status()
        return float(response.json()["current"]["cloud_cover"])
    except Exception:
        return 0.0


async def render_cloud_tile(z: int, x: int, y: int) -> bytes:
    west, south, east, north = _tile_to_bbox(z, x, y)
    n = _grid_size(z)

    # Boundary-inclusive sampling: corners sit exactly on the tile edges.
    # Adjacent tiles share the same lat/lon at their common boundary, so
    # Open-Meteo returns identical values there → zero visible seams.
    lats = [north - (north - south) * row / (n - 1) for row in range(n)]
    lons = [west + (east - west) * col / (n - 1) for col in range(n)]

    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [
            _fetch_cloud_cover(client, lats[row], lons[col])
            for row in range(n)
            for col in range(n)
        ]
        values = await asyncio.gather(*tasks)

    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    for idx, cloud_pct in enumerate(values):
        row, col = divmod(idx, n)
        alpha = int(cloud_pct / 100.0 * _ALPHA_OVERCAST)
        img.putpixel((col, row), (*_CLOUD_RGB, alpha))

    # BILINEAR: output alpha is guaranteed ≤ _ALPHA_OVERCAST (no overshoot)
    img = img.resize((256, 256), Image.BILINEAR)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
