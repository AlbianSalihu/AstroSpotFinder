import pytest

from app.models.location import Location
from app.models.pin import Pin
from app.repositories.pin_repository import DuplicatePinError, PinRepository


@pytest.fixture
def repository(tmp_path):
    return PinRepository(tmp_path / "pins.geojson")


def make_pin(
    pin_id: str = "pin-1",
    lat: float = 46.5,
    lon: float = 6.6,
    label: str | None = None,
) -> Pin:
    return Pin(
        id=pin_id,
        location=Location(latitude=lat, longitude=lon),
        source="test",
        label=label,
    )


def test_list_empty(repository):
    assert repository.list_pins() == []


def test_add_and_list(repository):
    pin = make_pin()
    repository.add_pin(pin)
    pins = repository.list_pins()
    assert len(pins) == 1
    assert pins[0].id == pin.id
    assert pins[0].location.latitude == pin.location.latitude
    assert pins[0].location.longitude == pin.location.longitude


def test_add_duplicate_raises(repository):
    pin = make_pin()
    repository.add_pin(pin)
    with pytest.raises(DuplicatePinError):
        repository.add_pin(pin)


def test_remove_existing(repository):
    pin = make_pin()
    repository.add_pin(pin)
    assert repository.remove_pin(pin.id) is True
    assert repository.list_pins() == []


def test_remove_nonexistent(repository):
    assert repository.remove_pin("does-not-exist") is False


def test_update_label(repository):
    pin = make_pin(label=None)
    repository.add_pin(pin)
    updated = repository.update_pin(pin.id, "New label")
    assert updated is not None
    assert updated.label == "New label"
    assert repository.list_pins()[0].label == "New label"


def test_update_label_to_none(repository):
    pin = make_pin(label="Old label")
    repository.add_pin(pin)
    updated = repository.update_pin(pin.id, None)
    assert updated is not None
    assert updated.label is None


def test_update_nonexistent_returns_none(repository):
    assert repository.update_pin("does-not-exist", "label") is None


def test_persists_across_instances(tmp_path):
    file_path = tmp_path / "pins.geojson"
    pin = make_pin()

    PinRepository(file_path).add_pin(pin)

    loaded = PinRepository(file_path).list_pins()
    assert len(loaded) == 1
    assert loaded[0].id == pin.id
