PIN_DATA = {
    "id": "pin-test-1",
    "location": {"latitude": 46.5, "longitude": 6.6},
    "source": "test",
    "label": "Test pin",
}


def test_list_pins_empty(client):
    response = client.get("/api/pins")
    assert response.status_code == 200
    assert response.json() == []


def test_create_pin(client):
    response = client.post("/api/pins", json=PIN_DATA)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == PIN_DATA["id"]
    assert data["label"] == PIN_DATA["label"]


def test_create_duplicate_pin(client):
    client.post("/api/pins", json=PIN_DATA)
    response = client.post("/api/pins", json=PIN_DATA)
    assert response.status_code == 409


def test_delete_pin(client):
    client.post("/api/pins", json=PIN_DATA)
    response = client.delete(f"/api/pins/{PIN_DATA['id']}")
    assert response.status_code == 204


def test_delete_nonexistent_pin(client):
    response = client.delete("/api/pins/does-not-exist")
    assert response.status_code == 404


def test_update_pin_label(client):
    client.post("/api/pins", json=PIN_DATA)
    response = client.patch(
        f"/api/pins/{PIN_DATA['id']}",
        json={"label": "Updated label"},
    )
    assert response.status_code == 200
    assert response.json()["label"] == "Updated label"


def test_update_pin_label_to_none(client):
    client.post("/api/pins", json=PIN_DATA)
    response = client.patch(
        f"/api/pins/{PIN_DATA['id']}",
        json={"label": None},
    )
    assert response.status_code == 200
    assert response.json()["label"] is None


def test_update_nonexistent_pin(client):
    response = client.patch("/api/pins/does-not-exist", json={"label": "x"})
    assert response.status_code == 404
