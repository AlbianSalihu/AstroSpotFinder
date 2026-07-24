from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.paths import DATA_DIRECTORY


DATASET_PATH = DATA_DIRECTORY / "light_pollution" / "light_pollution.tif"
METADATA_PATH = DATA_DIRECTORY / "light_pollution" / "metadata.json"

_UNIT_LABELS: dict[str, str] = {
    "nw_per_cm2_sr": "nW/cm²/sr",
    "rsb": "RSB",
}

# Map known source identifiers to unit keys
_SOURCE_UNITS: dict[str, str] = {
    "viirs_vnl": "nw_per_cm2_sr",
    "falchi_2016": "rsb",
}

FALCHI_DOWNLOAD_URL = (
    "https://eogdata.mines.edu/nighttime_light/annual/v22/2022/"
    "VNL_v22_npp-j01_2022_global_vcmslcfg_c202302011300.median_masked.dat.tif.gz"
)

_state: dict = {"downloading": False, "error": None}
_lock = threading.Lock()


def _detect_unit() -> str | None:
    """Return a unit key by inspecting metadata.json then the GeoTIFF itself."""
    # 1. Trust our own metadata first
    if METADATA_PATH.exists():
        try:
            meta = json.loads(METADATA_PATH.read_text())
            source = meta.get("source", "")
            if source in _SOURCE_UNITS:
                return _SOURCE_UNITS[source]
        except (json.JSONDecodeError, OSError):
            pass

    # 2. Read the GeoTIFF tags
    if DATASET_PATH.exists():
        try:
            import rasterio

            with rasterio.open(DATASET_PATH) as ds:
                # Band-level units (e.g. ('nW/cm^2/sr',))
                if ds.units and ds.units[0]:
                    u = ds.units[0].lower()
                    if "nw" in u or "nanowatt" in u:
                        return "nw_per_cm2_sr"
                    if "rsb" in u or "ratio" in u:
                        return "rsb"

                # GDAL tags — VIIRS VNL files embed the original filename in
                # TIFFTAG_DOCUMENTNAME even when no explicit unit tag is set.
                all_tags = {**ds.tags()}
                try:
                    all_tags.update(ds.tags(1))
                except Exception:
                    pass

                for val in all_tags.values():
                    v = str(val).lower()
                    if "vnl" in v or ("npp" in v and "viirs" not in v) or "viirs" in v:
                        return "nw_per_cm2_sr"
                    if "nw/cm" in v or "nanowatt" in v:
                        return "nw_per_cm2_sr"
                    if "rsb" in v or "ratio to" in v or "falchi" in v or "world_atlas" in v:
                        return "rsb"
        except Exception:
            pass

    return None


def get_status() -> dict:
    with _lock:
        downloading = _state["downloading"]
        error = _state["error"]

    available = DATASET_PATH.exists()
    downloaded_at: str | None = None
    is_outdated = False

    if available and METADATA_PATH.exists():
        try:
            meta = json.loads(METADATA_PATH.read_text())
            downloaded_at = meta.get("downloaded_at")
            source = meta.get("source", "unknown")
            is_outdated = source == "falchi_2016"
        except (json.JSONDecodeError, OSError):
            pass

    unit = _detect_unit() if available else None

    # Write metadata for manually placed files so detection is instant next time
    if available and not METADATA_PATH.exists() and unit is not None:
        source = {v: k for k, v in _SOURCE_UNITS.items()}.get(unit, "unknown")
        try:
            meta = {"source": source, "downloaded_at": None}
            METADATA_PATH.write_text(json.dumps(meta))
        except OSError:
            pass

    return {
        "available": available,
        "downloaded_at": downloaded_at,
        "downloading": downloading,
        "error": error,
        "is_outdated": is_outdated,
        "unit": unit,
        "unit_label": _UNIT_LABELS.get(unit) if unit else None,
    }


def _run_download() -> None:
    import gzip
    import shutil
    import tempfile

    try:
        DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)

        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            response = client.get(FALCHI_DOWNLOAD_URL)
            response.raise_for_status()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".tif.gz") as tmp:
            tmp.write(response.content)
            tmp_path = Path(tmp.name)

        try:
            with gzip.open(tmp_path, "rb") as gz_in:
                with open(DATASET_PATH, "wb") as out:
                    shutil.copyfileobj(gz_in, out)
        finally:
            tmp_path.unlink(missing_ok=True)

        meta = {
            "source": "viirs_vnl",
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
        }
        METADATA_PATH.write_text(json.dumps(meta))

        with _lock:
            _state["downloading"] = False
            _state["error"] = None

    except httpx.HTTPError as error:
        with _lock:
            _state["downloading"] = False
            _state["error"] = "manual_download_required"

    except Exception as error:
        with _lock:
            _state["downloading"] = False
            _state["error"] = str(error)


def start_download() -> None:
    with _lock:
        if _state["downloading"]:
            return
        _state["downloading"] = True
        _state["error"] = None

    thread = threading.Thread(target=_run_download, daemon=True)
    thread.start()
