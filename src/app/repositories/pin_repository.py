from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from app.models.pin import Pin


class DuplicatePinError(Exception):
    """Raised when a pin ID already exists."""


class PinRepository:
    def __init__(self, file_path: Path) -> None:
        self._file_path = file_path
        self._lock = threading.RLock()

        self._ensure_storage_exists()

    def list_pins(self) -> list[Pin]:
        with self._lock:
            document = self._read_document()

            return [
                self._feature_to_pin(feature)
                for feature in document["features"]
            ]

    def add_pin(self, pin: Pin) -> Pin:
        with self._lock:
            document = self._read_document()

            pin_exists = any(
                feature.get("id") == pin.id
                for feature in document["features"]
            )

            if pin_exists:
                raise DuplicatePinError(
                    f'Pin "{pin.id}" already exists.'
                )

            document["features"].append(
                self._pin_to_feature(pin)
            )

            self._write_document(document)

            return pin

    def update_pin(
        self,
        pin_id: str,
        label: str | None,
    ) -> Pin | None:
        with self._lock:
            document = self._read_document()

            for feature in document["features"]:
                if feature.get("id") == pin_id:
                    feature["properties"]["label"] = label
                    self._write_document(document)
                    return self._feature_to_pin(feature)

            return None

    def remove_pin(self, pin_id: str) -> bool:
        with self._lock:
            document = self._read_document()

            original_count = len(document["features"])

            document["features"] = [
                feature
                for feature in document["features"]
                if feature.get("id") != pin_id
            ]

            was_removed = (
                len(document["features"])
                < original_count
            )

            if was_removed:
                self._write_document(document)

            return was_removed

    def _ensure_storage_exists(self) -> None:
        self._file_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        if self._file_path.exists():
            return

        self._write_document(
            {
                "type": "FeatureCollection",
                "features": [],
            }
        )

    def _read_document(self) -> dict[str, Any]:
        try:
            with self._file_path.open(
                "r",
                encoding="utf-8",
            ) as file:
                document = json.load(file)
        except json.JSONDecodeError as error:
            raise RuntimeError(
                f"Invalid GeoJSON file: {self._file_path}"
            ) from error

        if document.get("type") != "FeatureCollection":
            raise RuntimeError(
                "The pins file must contain a "
                "GeoJSON FeatureCollection."
            )

        features = document.get("features")

        if not isinstance(features, list):
            raise RuntimeError(
                'The pins file must contain a "features" list.'
            )

        return document

    def _write_document(
        self,
        document: dict[str, Any],
    ) -> None:
        temporary_file = self._file_path.with_suffix(
            f"{self._file_path.suffix}.tmp"
        )

        with temporary_file.open(
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(
                document,
                file,
                ensure_ascii=False,
                indent=2,
            )

            file.write("\n")

        temporary_file.replace(self._file_path)

    @staticmethod
    def _pin_to_feature(pin: Pin) -> dict[str, Any]:
        return {
            "type": "Feature",
            "id": pin.id,
            "geometry": {
                "type": "Point",
                "coordinates": [
                    pin.location.longitude,
                    pin.location.latitude,
                ],
            },
            "properties": {
                "source": pin.source,
                "label": pin.label,
            },
        }

    @staticmethod
    def _feature_to_pin(
        feature: dict[str, Any],
    ) -> Pin:
        geometry = feature.get("geometry", {})
        properties = feature.get("properties", {})
        coordinates = geometry.get("coordinates", [])

        if geometry.get("type") != "Point":
            raise RuntimeError(
                "Every saved pin must use Point geometry."
            )

        if (
            not isinstance(coordinates, list)
            or len(coordinates) < 2
        ):
            raise RuntimeError(
                "A saved pin has invalid coordinates."
            )

        longitude, latitude = coordinates[:2]

        return Pin(
            id=str(feature["id"]),
            location={
                "latitude": latitude,
                "longitude": longitude,
            },
            source=properties.get(
                "source",
                "unknown",
            ),
            label=properties.get("label"),
        )