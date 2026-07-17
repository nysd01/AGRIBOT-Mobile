# AGRIBOT Sensor API

Cloud backend for AGRIBOT: the **ESP32-Sensor POSTs readings**, the **mobile app GETs them**.
A small **layered microservice** (FastAPI → business → SQLAlchemy/PostgreSQL) built to be
containerized, tested, monitored, and orchestrated.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness (used by k8s + monitoring) |
| POST | `/readings` | ingest a sensor reading (ESP32) |
| GET | `/readings?limit=` | recent readings (app) |
| GET | `/readings/latest` | most recent reading |
| GET | `/metrics` | Prometheus metrics |
| GET | `/docs` | **Swagger UI** (interactive API docs) |
| GET | `/openapi.json` | OpenAPI schema (Postman import) |

## Run locally
```bash
python -m venv .venv && .venv\Scripts\activate      # (Windows)
pip install -r requirements.txt
uvicorn app.main:app --reload                        # http://localhost:8000/docs
```

## Test (80%+ coverage)
```bash
pytest                     # runs against in-memory SQLite; writes htmlcov/ report
```

## Full stack with Docker (API + Postgres + Prometheus + Grafana)
```bash
docker compose up --build
#  API      http://localhost:8000/docs
#  Prom     http://localhost:9090
#  Grafana  http://localhost:3000   (admin / admin)
```

## Point the ESP32 / app at it
- **ESP32-Sensor:** POST JSON to `http://<server>/readings`
  (`{"device_id","temperature","humidity","soil_moisture","smoke_raw","smoke_detected","flame_detected"}`)
- **Mobile app:** GET `http://<server>/readings/latest`

## Architecture (style)
**Microservices + layered**, deployed on **Kubernetes**, fed by an **event-driven** IoT edge
(ESP32 over HTTP/MQTT). See the top-level architecture report.
