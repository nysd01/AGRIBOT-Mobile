# AGRIBOT — Software Architecture Report

**Course:** SEN3244 — Software Architecture
**Faculty of Information and Communication Technologies · Spring 2026**
**Instructor:** Engr. TEKOH PALMA
**System:** AGRIBOT — an IoT precision-agriculture robot with a mobile control app, an edge hub, and a cloud microservice.

---

## 1. Executive Summary

AGRIBOT is a distributed system that lets a farmer drive a field robot, watch its live camera, and read its environmental sensors from a phone — whether the robot is on the same Wi-Fi (offline/local) or across the internet (online/cloud). This report describes the **software architecture** of AGRIBOT: the significant design decisions, the structures those decisions produce, and the quality attributes (architecture characteristics) the design is built to satisfy.

The system is deliberately built as **four cooperating tiers** — *device*, *edge*, *cloud service*, and *client* — using a blend of **microservices, event-driven messaging, layered internal design, and an edge/cloud IoT split**. This report focuses on the cloud microservice (`agribot-api`) as the exemplar of the architecture, because it is the piece that is containerised, tested, monitored, and orchestrated, while placing it in the context of the whole robot.

---

## 2. Architecturally Significant Requirements (ASRs)

Architecture is shaped by the requirements that are hard to change later. These are AGRIBOT's:

| ID | Requirement | Type | Why it drives architecture |
|----|-------------|------|----------------------------|
| ASR-1 | The farmer must control the robot even with **no internet** (field has no signal). | Functional + availability | Forces an **edge tier** with a local broker; you cannot depend only on the cloud. |
| ASR-2 | Sensor and telemetry data must survive connectivity loss and **reconcile later**. | Reliability | Forces **local store + async sync**, not synchronous cloud writes. |
| ASR-3 | Camera/motor commands must feel **real-time** (< ~300 ms perceived). | Performance | Forces **lightweight pub/sub (MQTT)** and **WebRTC**, not request/response polling. |
| ASR-4 | The backend must **scale** when many robots/clients connect. | Scalability | Forces **stateless, horizontally scalable** services + orchestration. |
| ASR-5 | The system must be **operable**: deployable, observable, recoverable. | Operability | Forces **containers, CI/CD, metrics, IaC, self-healing**. |
| ASR-6 | New capabilities (sensors, endpoints) must be added **without breaking** clients. | Modifiability | Forces **API versioning + layered, loosely-coupled modules**. |
| ASR-7 | Credentials and control channels must not be **openly exposed**. | Security | Forces **firewall, reverse proxy, secrets, least-privilege**. |

> These seven ASRs are the "why" behind every decision that follows. Each Architecture Decision Record in §7 traces back to one or more of them.

---

## 3. Architecture Drivers → Chosen Styles

AGRIBOT is not a single architectural style; it is a **hybrid**, because different parts of the system have different dominant concerns.

| Concern (from ASRs) | Style applied | Where |
|---|---|---|
| Real-time, decoupled commands (ASR-3) | **Event-Driven / Publish–Subscribe** | MQTT between app ⇄ ESP32 / edge |
| Offline-first, reconcile later (ASR-1, ASR-2) | **Edge / Cloud (Fog) IoT** | Edge hub owns local truth, cloud is eventual |
| Independent scaling & deployment (ASR-4, ASR-5) | **Microservices** | `agribot-api` container, orchestrated by k3s |
| Maintainable internals (ASR-6) | **Layered (n-tier)** | Inside `agribot-api`: routing → service → data |
| Operability (ASR-5) | **Cloud-native / 12-factor** | Stateless, config via env, logs to stdout |

**Why hybrid and not one pure style?** A pure microservices cloud would fail ASR-1 (no offline control). A pure edge system would fail ASR-4 (no elastic scale, no central data). Splitting concerns by tier lets each tier use the style that fits its forces — this is the central architectural insight of AGRIBOT.

---

## 4. System Context (C4 Level 1)

```
                         ┌─────────────────────────────┐
                         │        FARMER (user)        │
                         └──────────────┬──────────────┘
                                        │ drives robot, views camera & sensors
                                        ▼
                         ┌─────────────────────────────┐
                         │   AGRIBOT Mobile App        │
                         │   (Expo / React Native)     │
                         └───────┬─────────────┬───────┘
              online (internet)  │             │  offline (same Wi-Fi)
                                 ▼             ▼
        ┌──────────────────────────┐   ┌──────────────────────────┐
        │  CLOUD (VPS)             │   │   EDGE HUB (Win11 laptop) │
        │  ┌────────────────────┐  │   │  ┌────────────────────┐  │
        │  │ agribot-api (K8s)  │  │   │  │ Mosquitto broker   │  │
        │  │ + Postgres         │  │   │  │ WebRTC cam+audio    │  │
        │  │ + Prometheus/Grafana│ │   │  │ SQLite local store  │  │
        │  └─────────┬──────────┘  │   │  └─────────┬──────────┘  │
        │            │ sync         │  └────────────┼─────────────┘
        │            ▼              │               │ local MQTT / WebRTC
        │      ┌───────────┐        │               ▼
        │      │ Supabase  │◄───────┼──────────  ┌──────────────────┐
        │      │ (cloud DB)│  eventual sync       │  ESP32 devices   │
        │      └───────────┘        │             │  • motors        │
        └──────────────────────────┘             │  • sensors/camera│
                                                  └──────────────────┘
```

**Reading the diagram:** the app has **two paths to the robot**. Online, it talks to the cloud microservice and to HiveMQ/Supabase. Offline, it talks directly to the edge hub on the LAN, which owns the local broker and a local database that later *syncs* to Supabase. The ESP32 devices are the physical robot: one firmware drives motors, another reads sensors / streams camera.

---

## 5. The Four Structures (Views)

Software architecture is best described through **multiple structures**, because no single diagram captures everything (Bass, Clements & Kazman). We present four.

### 5.1 Module (code) structure — *how the code is decomposed*

Inside the cloud microservice, a **strict layering** enforces modifiability (ASR-6):

```
agribot-api/
├── app/
│   ├── main.py        ← Presentation layer: FastAPI routes, request/response, OpenAPI
│   ├── models.py      ← Domain layer: SQLAlchemy entities (SensorReading, Command…)
│   ├── database.py    ← Data-access layer: engine, session, connection lifecycle
│   └── config.py      ← Cross-cutting: configuration from environment (12-factor)
├── tests/             ← Test module mirrors app/ (conftest fixtures + test_api)
├── k8s/               ← Deployment descriptors (orchestration)
├── ansible/           ← Infrastructure-as-Code
└── monitoring/        ← Observability config
```

**Rule:** dependencies point **downward only** — routes may call the data layer, the data layer never imports routes. This keeps the "reason to change" isolated: a schema change touches `models.py`; a new endpoint touches `main.py`; neither ripples across the other.

### 5.2 Component-and-Connector (runtime) structure — *what talks to what at run time*

```
   [Mobile App] ──HTTPS/REST──▶ [Nginx reverse proxy] ──▶ [agribot-api pods] ──SQL──▶ [Postgres]
        │                                                        │
        │                                                        └──/metrics──▶ [Prometheus] ──▶ [Grafana]
        │
        └──MQTT pub/sub──▶ [HiveMQ / Mosquitto] ◀──MQTT──── [ESP32 motors/sensors]
        │
        └──WebRTC (SRTP)──▶ [Edge hub] ◀──camera/audio──── [ESP32 / USB cam]
```

**Connectors are first-class here.** AGRIBOT deliberately uses **three different connector types**, each chosen for its quality:
- **REST/HTTP** — request/response for *stateful data* (sensor history, commands log). Cacheable, debuggable, versioned.
- **MQTT pub/sub** — fire-and-forget for *control & telemetry*. Decoupled: publisher doesn't know/wait for subscribers → satisfies ASR-3.
- **WebRTC** — peer streaming for *media*. Low-latency, NAT-traversing, encrypted.

### 5.3 Allocation (deployment) structure — *where it runs*

```
┌──────────────────────── VPS (Ubuntu, 38.242.246.126) ─────────────────────────┐
│  ufw firewall (deny incoming; allow 22, 80/443, 30080, 13000…)                 │
│  ┌─────────────────────────── k3s (Kubernetes) ─────────────────────────────┐ │
│  │  namespace: agribot                                                       │ │
│  │   Deployment agribot-api  (replicas 2→5 via HPA, RollingUpdate)           │ │
│  │   Service    agribot-api  (NodePort 30080)      ← service discovery       │ │
│  │   Deployment postgres     + PVC (persistent volume)                       │ │
│  │   Service    postgres     (ClusterIP)           ← stable DNS name         │ │
│  │   HPA        agribot-api-hpa (target CPU 70%)                             │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│  docker-compose (dev/monitoring): prometheus, grafana                          │
└────────────────────────────────────────────────────────────────────────────────┘
        Edge tier runs on a Win11 laptop on the farm LAN (separate node).
        Device tier runs on ESP32 microcontrollers (bare-metal firmware).
```

Note how **module ≠ component ≠ deployment**: one code module (`agribot-api`) becomes *two-to-five* runtime pods on *one* physical node. Conflating these three is the classic architecture mistake this section avoids.

### 5.4 Decision (allocation of responsibility) structure

| Responsibility | Owned by | Not by |
|---|---|---|
| Physical actuation & raw sensing | ESP32 firmware | (never the cloud) |
| Local truth when offline | Edge hub (SQLite + Mosquitto) | Cloud |
| System-of-record & analytics | Cloud (Postgres/Supabase) | Edge |
| Presentation & user intent | Mobile app | Backend |

This is the "who is authoritative" map — it prevents the split-brain problem where both edge and cloud think they own the data. **Edge is authoritative while disconnected; cloud is authoritative once synced.**

---

## 6. Architecture Characteristics (Quality Attributes)

For each characteristic we give the **scenario** (stimulus → response → measure) and the **tactic** used to achieve it — the standard SEI quality-attribute-scenario method.

### 6.1 Scalability *(primary)*
- **Scenario:** Load rises from 2 to 50 concurrent clients → system keeps p95 latency < 500 ms → no manual intervention.
- **Tactics:** *stateless services* (any pod serves any request), *horizontal duplication* (K8s replicas), *autoscaling* (HPA scales 2→5 on CPU > 70%). Verified live: `kubectl get hpa` shows `cpu: 4%/70% 2→5`.

### 6.2 Availability *(primary)*
- **Scenario:** A pod crashes → Kubernetes restarts it → service stays reachable, recovery < 15 s.
- **Tactics:** *health monitoring* (readiness + liveness probes on `/health`), *self-healing* (K8s recreates dead pods — proven: deleted both pods, recreated in ~12 s), *rolling updates* with `maxUnavailable: 0` (zero-downtime deploys), *offline fallback* (edge tier keeps working with no cloud at all — ASR-1).

### 6.3 Performance
- **Scenario:** Farmer sends a "turn left" command → robot reacts → perceived latency < 300 ms.
- **Tactics:** *async I/O* (FastAPI/uvicorn non-blocking), *pub/sub over request/response* for control, *WebRTC* for media (no store-and-forward), *reduce computational overhead* (thin JSON payloads).

### 6.4 Modifiability
- **Scenario:** A new sensor type is added → only the data + one endpoint change → no client breakage, deployed same day.
- **Tactics:** *strict layering* (§5.1), *loose coupling* via pub/sub, *API versioning*, *high cohesion* (one module = one reason to change).

### 6.5 Testability
- **Scenario:** A change is pushed → the pipeline proves correctness → merge blocked if coverage < 80%.
- **Tactics:** *dependency injection* of the DB session (tests use an in-memory SQLite fixture), *isolated units*, *coverage gate* (`--cov-fail-under=80`; achieved **95%**, 10 tests).

### 6.6 Observability
- **Scenario:** Latency spikes in production → operator sees it on a dashboard within 5 s → roots-causes without SSH.
- **Tactics:** *metrics instrumentation* (`/metrics`, Prometheus scrape), *dashboards* (Grafana: req rate, status codes, p95, in-flight), *structured health endpoint*.

### 6.7 Security
- **Scenario:** An attacker scans the VPS → only intended ports respond → control channels are not open.
- **Tactics:** *limit exposure* (ufw firewall, default-deny), *reverse proxy* (Nginx terminates/filters before the app), *secrets management* (K8s Secret for DB creds, not in code), *least privilege*.

### 6.8 Deployability *(operability)*
- **Scenario:** A fresh VPS must run the whole stack → two commands → running system, repeatably.
- **Tactics:** *Infrastructure-as-Code* (Ansible, idempotent), *containerisation* (Docker), *CI/CD* (Jenkins: test → build → deploy → smoke), *immutable images*.

### 6.9 The trade-offs (there is no free lunch)

| We favoured | We traded away | Justification |
|---|---|---|
| Availability (offline edge) | Strong consistency | Farm has no signal; eventual consistency via sync is acceptable (ASR-1/2). |
| Scalability (stateless + K8s) | Operational simplicity | Orchestration adds moving parts, but ASR-4/5 demand it. |
| Performance (pub/sub, UDP media) | Delivery guarantees | A dropped video frame is fine; a laggy command is not (ASR-3). |
| Modifiability (many layers/tiers) | Raw latency of a call | Extra hop cost is small vs. long-term change cost (ASR-6). |

Naming the trade-offs explicitly is what separates an *architecture* from an *implementation* — every characteristic strengthened weakens another, and these choices are deliberate.

---

## 7. Architecture Decision Records (ADRs)

> ADRs capture *why*, so future maintainers don't undo decisions without knowing the reasoning.

**ADR-1 — Split the system into edge and cloud tiers.**
*Context:* Fields have no reliable internet (ASR-1). *Decision:* Run a full local control path on an on-site edge hub; treat the cloud as eventually-consistent. *Consequence:* + offline operation, + resilience; − must reconcile data (sync logic), − two code paths to maintain.

**ADR-2 — Use MQTT publish/subscribe for control & telemetry.**
*Context:* Commands must be real-time and decoupled (ASR-3). *Decision:* MQTT broker (HiveMQ online / Mosquitto on edge) instead of REST polling. *Consequence:* + low latency, + producers/consumers independent; − at-most/at-least-once semantics to reason about, − another broker to run.

**ADR-3 — Package the backend as a stateless microservice in containers.**
*Context:* Must scale and deploy independently (ASR-4/5). *Decision:* FastAPI service, Dockerised, orchestrated by k3s with an HPA. *Consequence:* + horizontal scale, + self-healing, + zero-downtime deploys; − orchestration complexity.

**ADR-4 — Enforce an 80% test-coverage gate in CI.**
*Context:* Changes must be safe (ASR-6, testability). *Decision:* Jenkins fails the build below 80% (`--cov-fail-under=80`). *Consequence:* + regressions caught pre-deploy; − slightly slower merges. *(Achieved 95%.)*

**ADR-5 — Put an Nginx reverse proxy and ufw firewall in front of everything.**
*Context:* Minimise attack surface (ASR-7). *Decision:* Default-deny firewall; Nginx as the single public entry point. *Consequence:* + smaller surface, + TLS/routing in one place; − one more hop and config.

**ADR-6 — Provision infrastructure with Ansible (IaC).**
*Context:* The server must be reproducible (ASR-5). *Decision:* Two idempotent playbooks (provision + deploy). *Consequence:* + rebuild on a new VPS in minutes, + no snowflake servers; − must keep playbooks current with reality.

---

## 8. How the Architecture Is Validated

An architecture claim is only credible if it is **demonstrated**, not asserted. Mapping of characteristic → evidence in this repository:

| Characteristic | Evidence (runnable / observable) |
|---|---|
| Scalability | `kubectl -n agribot get hpa` → `2→5, cpu 4%/70%` |
| Availability | Deleted both pods → recreated in ~12 s; `rollout status` → *successfully rolled out* |
| Testability | `pytest --cov` → **95%**, 10 tests, CI gate at 80% |
| Observability | Grafana dashboard *"AGRIBOT API — Monitoring"* (4 panels) |
| Deployability | `ansible-playbook … playbook-provision.yml && … playbook-deploy.yml` |
| Security | `ufw status` → default deny; Nginx as sole entry point |
| API contract | Live OpenAPI/Swagger at `/docs` |

---

## 9. Summary

AGRIBOT's architecture is a **tiered hybrid** — event-driven at the edge for real-time offline control, microservice-and-orchestrated in the cloud for scale and operability, layered inside each service for maintainability. Every structural choice traces to an architecturally-significant requirement, every quality attribute is expressed as a measurable scenario with a named tactic, and each is backed by running evidence. The deliberate, documented trade-offs (availability over consistency, scalability over simplicity, latency over delivery guarantees) are what make this a designed architecture rather than an accidental one.
