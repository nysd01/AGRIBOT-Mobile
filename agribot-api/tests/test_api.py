"""Unit + integration tests for the AGRIBOT Sensor API."""

SAMPLE = {
    "device_id": "AGRIBOT-SENSORS",
    "temperature": 29.7,
    "humidity": 67.0,
    "soil_moisture": 100.0,
    "smoke_raw": 401,
    "smoke_detected": False,
    "flame_detected": False,
}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["service"] == "agribot-api"


def test_root_redirects_to_docs(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (307, 308)
    assert "/docs" in r.headers["location"]


def test_metrics_exposed(client):
    client.get("/health")
    r = client.get("/metrics")
    assert r.status_code == 200
    assert b"http_request" in r.content  # Prometheus metrics present


def test_create_reading(client):
    r = client.post("/readings", json=SAMPLE)
    assert r.status_code == 201
    data = r.json()
    assert data["temperature"] == 29.7
    assert data["device_id"] == "AGRIBOT-SENSORS"
    assert "id" in data and "created_at" in data


def test_create_minimal_reading_uses_defaults(client):
    r = client.post("/readings", json={"temperature": 20})
    assert r.status_code == 201
    data = r.json()
    assert data["device_id"] == "AGRIBOT-SENSORS"  # default applied
    assert data["smoke_detected"] is False


def test_invalid_payload_rejected(client):
    r = client.post("/readings", json={"temperature": "not-a-number"})
    assert r.status_code == 422  # validation error


def test_list_and_latest(client):
    for t in (10, 20, 30):
        client.post("/readings", json={"temperature": t})
    r = client.get("/readings")
    assert r.status_code == 200
    assert len(r.json()) == 3

    latest = client.get("/readings/latest")
    assert latest.status_code == 200
    assert latest.json()["temperature"] == 30  # most recent first


def test_list_limit_is_capped(client):
    for i in range(5):
        client.post("/readings", json={"temperature": i})
    r = client.get("/readings?limit=2")
    assert len(r.json()) == 2


def test_latest_empty_returns_404(client):
    r = client.get("/readings/latest")
    assert r.status_code == 404


def test_openapi_schema_available(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "/readings" in r.json()["paths"]
