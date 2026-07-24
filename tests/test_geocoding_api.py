import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.server import app


client = TestClient(app)

NOMINATIM_RESULT = {
    "lat": "46.5196535",
    "lon": "6.6322734",
    "display_name": "Lausanne, District de Lausanne, Vaud, Switzerland",
    "boundingbox": ["46.4", "46.6", "6.5", "6.7"],
}


def mock_nominatim(response_data):
    mock_response = MagicMock()
    mock_response.json.return_value = response_data
    mock_response.raise_for_status = MagicMock()

    mock_http_client = MagicMock()
    mock_http_client.__enter__ = MagicMock(return_value=mock_http_client)
    mock_http_client.__exit__ = MagicMock(return_value=False)
    mock_http_client.get.return_value = mock_response

    return patch(
        "geocoding.nominatim.httpx.Client",
        return_value=mock_http_client,
    )


def test_geocode_returns_results():
    with mock_nominatim([NOMINATIM_RESULT]):
        response = client.get("/api/geocode?q=Lausanne")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["label"] == NOMINATIM_RESULT["display_name"]
    assert data[0]["location"]["latitude"] == pytest.approx(46.5196535)
    assert data[0]["bounding_box"]["north"] == pytest.approx(46.6)
    assert data[0]["bounding_box"]["west"] == pytest.approx(6.5)


def test_geocode_empty_results():
    with mock_nominatim([]):
        response = client.get("/api/geocode?q=zzzzzzzzz")

    assert response.status_code == 200
    assert response.json() == []


def test_geocode_missing_query():
    response = client.get("/api/geocode")
    assert response.status_code == 422


def test_geocode_service_unavailable():
    import httpx

    with patch("geocoding.nominatim.httpx.Client") as MockClient:
        mock_http_client = MagicMock()
        mock_http_client.__enter__ = MagicMock(return_value=mock_http_client)
        mock_http_client.__exit__ = MagicMock(return_value=False)
        mock_http_client.get.side_effect = httpx.HTTPStatusError(
            "Server Error",
            request=MagicMock(),
            response=MagicMock(),
        )
        MockClient.return_value = mock_http_client

        response = client.get("/api/geocode?q=Lausanne")

    assert response.status_code == 502
