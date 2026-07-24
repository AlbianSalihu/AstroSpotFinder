from pathlib import Path


APP_DIRECTORY = Path(__file__).resolve().parent
SRC_DIRECTORY = APP_DIRECTORY.parent
PROJECT_DIRECTORY = SRC_DIRECTORY.parent

STATIC_DIRECTORY = APP_DIRECTORY / "static"

DATA_DIRECTORY = PROJECT_DIRECTORY / "data"
PINS_FILE = DATA_DIRECTORY / "pins.geojson"