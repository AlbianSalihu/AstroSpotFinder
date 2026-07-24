from __future__ import annotations

import threading
import webbrowser
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.cloud_cover import router as cloud_cover_router
from app.api.elevation import router as elevation_router
from app.api.geocoding import router as geocoding_router
from app.api.horizon import router as horizon_router
from app.api.intersect import router as intersect_router
from app.api.local_horizon import router as local_horizon_router
from app.api.parkings import router as parkings_router
from app.api.union import router as union_router
from app.api.walking_isochrones import router as walking_isochrones_router
from app.api.isochrones import router as isochrones_router
from app.api.light_pollution import router as light_pollution_router
from app.api.pins import router as pins_router
from app.api.world_cover import router as world_cover_router
from app.paths import STATIC_DIRECTORY
from light_pollution import dataset as lp_dataset


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not lp_dataset.get_status()["available"]:
        lp_dataset.start_download()
    yield


app = FastAPI(
    title="AstroSpotFinder",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(cloud_cover_router)
app.include_router(elevation_router)
app.include_router(geocoding_router)
app.include_router(horizon_router)
app.include_router(intersect_router)
app.include_router(local_horizon_router)
app.include_router(union_router)
app.include_router(parkings_router)
app.include_router(walking_isochrones_router)
app.include_router(isochrones_router)
app.include_router(light_pollution_router)
app.include_router(pins_router)
app.include_router(world_cover_router)

# Keep this mount after all API routes.
app.mount(
    "/",
    StaticFiles(
        directory=STATIC_DIRECTORY,
        html=True,
    ),
    name="frontend",
)


def run_server(
    host: str = "127.0.0.1",
    port: int = 8000,
    open_browser: bool = True,
) -> None:
    url = f"http://{host}:{port}"

    print(f"AstroSpotFinder is available at {url}")
    print("Use Ctrl+C to stop the server.")

    if open_browser:
        threading.Timer(
            0.75,
            webbrowser.open,
            args=(url,),
        ).start()

    uvicorn.run(
        app,
        host=host,
        port=port,
    )