import pytest
from fastapi.testclient import TestClient

from app.api.pins import get_repository
from app.repositories.pin_repository import PinRepository
from app.server import app


@pytest.fixture
def pin_repository(tmp_path):
    return PinRepository(tmp_path / "pins.geojson")


@pytest.fixture
def client(pin_repository):
    app.dependency_overrides[get_repository] = lambda: pin_repository
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
