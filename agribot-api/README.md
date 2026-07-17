# AGRIBOT Sensor API

> Cloud backend for the AGRIBOT precision-agriculture robot.
> The **ESP32 sensor node POSTs readings**; the **mobile app GETs them**.
> A small, production-operated **microservice** — containerised, tested (95%), monitored, and orchestrated on Kubernetes.

[![coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)](htmlcov/index.html)
[![tests](https://img.shields.io/badge/tests-10%20passing-brightgreen)](tests/)
[![docs](https://img.shields.io/badge/API%20docs-Swagger%20%2Fdocs-blue)](http://localhost:8000/docs)
[![style](https://img.shields.io/badge/architecture-microservice%20%2B%20layered-informational)](docs/ARCHITECTURE.md)

---

## Table of contents
- [What this is](#what-this-is)
- [Where it fits in AGRIBOT](#where-it-fits-in-agribot)
- [API reference](#api-reference)
- [Quick start (local)](#quick-start-local)
- [Run the full stack (Docker)](#run-the-full-stack-docker)
- [Testing](#testing)
- [Deploy to production (Kubernetes)](#deploy-to-production-kubernetes)
- [CI/CD, IaC & monitoring](#cicd-iac--monitoring)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Documentation index](#documentation-index)

---

## What this is

A **layered microservice** (FastAPI → business logic → SQLAlchemy/PostgreSQL) that ingests and serves AGRIBOT sensor telemetry. It is the cloud tier of a larger IoT system and is deliberately built to demonstrate the full software-architecture lifecycle: **design → test → containerise → orchestrate → automate → observe.**

- **Framework:** FastAPI + Uvicorn (async, auto-generated Swagger)
- **Data:** SQLAlchemy 2.0 + PostgreSQL (SQLite in dev/test)
- **Ops:** Docker · Kubernetes (k3s) with HPA autoscaling · Jenkins CI/CD · Ansible IaC · Prometheus + Grafana

## Where it fits in AGRIBOT

```
 ESP32 sensor ──POST /readings──▶  agribot-api  ──SQL──▶  PostgreSQL
                                        │
 Mobile app  ──GET /readings/latest─────┘  ──/metrics──▶  Prometheus ──▶ Grafana
```

The robot's other channels (motor control over MQTT, camera over WebRTC, offline edge hub) are documented in the [top-level architecture report](docs/ARCHITECTURE.md).

---

## API reference

Interactive, always-current docs are served live at **`/docs`** (Swagger UI) and **`/openapi.json`** (import into Postman).

| Method | Path | Purpose | Caller |
|---|---|---|---|
| `GET` | `/health` | Liveness probe | Kubernetes, monitoring |
| `POST` | `/readings` | Ingest one sensor reading | ESP32 sensor node |
| `GET` | `/readings?limit=N` | Recent readings, newest first (N ≤ 500) | Mobile app, analytics |
| `GET` | `/readings/latest` | The single most recent reading | Mobile app |
| `GET` | `/metrics` | Prometheus metrics | Prometheus |
| `GET` | `/docs` | Swagger UI | Humans |

**Reading payload (POST `/readings`):**
```json
{
  "device_id": "esp32-sensor-01",
  "temperature": 27.4,
  "humidity": 61.2,
  "soil_moisture": 430,
  "smoke_raw": 120,
  "smoke_detected": false,
  "flame_detected": false
}
```

---

## Quick start (local)

```bash
# Windows PowerShell
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
```bash
# macOS / Linux
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Open **http://localhost:8000/docs** and try the endpoints from the browser.

Smoke-test it:
```bash
curl -X POST http://localhost:8000/readings \
  -H "Content-Type: application/json" \
  -d '{"device_id":"esp32-sensor-01","temperature":27.4,"humidity":61.2,"soil_moisture":430,"smoke_raw":120,"smoke_detected":false,"flame_detected":false}'

curl http://localhost:8000/readings/latest
```

---

## Run the full stack (Docker)

Brings up **API + PostgreSQL + Prometheus + Grafana** together:
```bash
docker compose up --build
```
| Service | URL | Credentials |
|---|---|---|
| API + Swagger | http://localhost:8010/docs | — |
| Prometheus | http://localhost:19090 | — |
| Grafana | http://localhost:13000 | `admin` / `admin` |

Grafana auto-loads the **"AGRIBOT API — Monitoring"** dashboard (request rate, status codes, p95 latency, in-flight requests).

---

## Testing

```bash
pytest                 # in-memory SQLite; fails the run under 80% coverage
```
- **95% coverage**, 10 tests. HTML report written to `htmlcov/index.html`.
- The DB session is dependency-injected, so tests run fully isolated with no external Postgres.
- The 80% gate (`--cov-fail-under=80` in `pytest.ini`) is enforced again in CI — see below.

---

## Deploy to production (Kubernetes)

Runs on **k3s** (lightweight single-node Kubernetes) on the VPS. Full walkthrough in [k8s/README.md](k8s/README.md).

```bash
# on the VPS
docker build -t agribot-api:latest .
docker save agribot-api:latest | sudo k3s ctr images import -
kubectl apply -f k8s/
kubectl -n agribot get pods,svc,hpa
```
You get: **2–5 auto-scaling replicas** (HPA on CPU 70%), **self-healing** (dead pods recreated in ~12 s), **zero-downtime rolling updates** (`maxUnavailable: 0`), and **service discovery** via the `postgres` Service DNS name. API is reachable on **`:30080`**.

---

## CI/CD, IaC & monitoring

| Concern | Tool | Entry point |
|---|---|---|
| **CI/CD** — test-gate → build → deploy → smoke | Jenkins | [`Jenkinsfile`](Jenkinsfile) |
| **Infrastructure-as-Code** — provision + deploy | Ansible | [`ansible/`](ansible/README.md) |
| **Monitoring** — metrics + dashboards | Prometheus + Grafana | [`monitoring/`](monitoring/) |
| **Orchestration** — scaling, self-healing | Kubernetes (k3s) | [`k8s/`](k8s/README.md) |

Rebuild the entire server from scratch with two Ansible commands:
```bash
ansible-playbook -i ansible/inventory.ini ansible/playbook-provision.yml --ask-pass
ansible-playbook -i ansible/inventory.ini ansible/playbook-deploy.yml   --ask-pass
```

---

## Configuration

12-factor: all config comes from the environment. Copy `.env.example` → `.env` and adjust.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./agribot.db` | DB connection (Postgres URL in prod) |
| `API_PORT` | `18080` | Host port for the API container |
| `PROM_PORT` | `19090` | Host port for Prometheus |
| `GRAFANA_PORT` | `13000` | Host port for Grafana |

---

## Project layout

```
agribot-api/
├── app/
│   ├── main.py        # Presentation — FastAPI routes + Swagger
│   ├── models.py      # Domain — SQLAlchemy + Pydantic schemas
│   ├── database.py    # Data-access — engine, session, get_db
│   └── config.py      # Config from environment (12-factor)
├── tests/             # pytest suite (95% coverage)
├── k8s/               # Kubernetes manifests + guide
├── ansible/           # IaC playbooks + inventory
├── monitoring/        # Prometheus + Grafana provisioning
├── docs/              # Architecture, Innovation, User Manual
├── Dockerfile         # Container image
├── docker-compose.yml # Full local stack
└── Jenkinsfile        # CI/CD pipeline
```

---

## Documentation index

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Structures, quality attributes, ADRs (rubric §8) |
| [docs/INNOVATION.md](docs/INNOVATION.md) | What's novel and why (rubric §9) |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | Step-by-step guide for operators & end users (rubric §10) |
| [k8s/README.md](k8s/README.md) | Kubernetes deploy + scaling/rolling-update demos |
| [ansible/README.md](ansible/README.md) | Infrastructure-as-Code runbook |
| `/docs` (live) | Interactive Swagger API reference |

---

**Architecture style:** Microservices + Layered, orchestrated on Kubernetes, fed by an event-driven IoT edge (ESP32 over HTTP/MQTT). See the [architecture report](docs/ARCHITECTURE.md).
