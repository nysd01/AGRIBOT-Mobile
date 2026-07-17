# AGRIBOT — 7-Minute Demo Video Script

**Course:** SEN3244 — Software Architecture · Spring 2026 · Engr. TEKOH PALMA
**Total runtime target: 7:00.** Times are cumulative. Everything below is *live* and already running on the VPS (`38.242.246.126`).

> **Before you hit record**, set up these terminals/tabs so you never fumble:
> - **Terminal 1** — SSH to the VPS (for kubectl/docker/curl)
> - **Terminal 2** — a second SSH session (for the "hammer the service" loop)
> - **Browser Tab A** — `https://38.242.246.126:8443/docs` (Swagger over HTTPS)
> - **Browser Tab B** — `http://38.242.246.126:13000` (Grafana, dashboard open)
> - **Browser Tab C** — Jenkins → your `agribot-api` job → last green build
> - Have the ESP32 powered on (or the simulate-loop ready as backup)

---

## SCENE 1 — Intro & problem (0:00 → 0:40)

**On screen:** you talking, or a title slide.

> "Hi, I'm [name]. This is AGRIBOT — an IoT precision-agriculture robot. The architecture problem I set out to solve is simple but hard: **a farm has no reliable internet**, yet the farmer still needs to drive the robot, watch its camera, and read its sensors. So I designed a system that works both online and offline, and — for this course — I built the cloud backend to full production standard: containerised, tested, monitored, auto-scaling, self-healing, and continuously deployed. Let me show you it running live."

---

## SCENE 2 — Architecture overview (0:40 → 1:20)

**On screen:** the architecture diagram from `docs/ARCHITECTURE.md` (§4 System Context).

> "Four tiers. The **device** — ESP32 microcontrollers reading temperature, humidity, soil moisture, smoke and flame. The **edge** — an on-site hub that keeps working with no internet. The **cloud** — this FastAPI microservice on Kubernetes. And the **client** — a React Native app. It's a hybrid architecture: event-driven for real-time control, edge-cloud for offline resilience, microservices for scale. Today I'm demonstrating the cloud tier and the live sensor path."

---

## SCENE 3 — Live sensor data → cloud (1:20 → 2:20)

**On screen:** the ESP32, then Terminal 1 + Swagger.

**Do:** show the board. In Terminal 1:
```bash
watch -n 2 'curl -sk https://38.242.246.126:8443/readings/latest'
```

> "Here's the real sensor node. It posts readings over HTTPS every few seconds to the cloud API — through an Nginx reverse proxy with TLS. Watch the `latest` reading update live... there — new temperature, humidity, soil moisture, each with a fresh timestamp and ID. That's genuine hardware talking to the cloud."

**Then** switch to Swagger Tab A → `GET /readings` → **Execute**:

> "And here's the auto-generated Swagger API. `GET /readings` returns the stored history — every reading persisted in PostgreSQL. This is section 10, documentation, and the API contract, all live."

*(Backup if no board: run the simulate-loop from the user manual instead — same endpoint.)*

---

## SCENE 4 — Monitoring in Grafana (2:20 → 3:00)

**On screen:** Grafana Tab B.

**Do:** while a load loop runs in Terminal 2:
```bash
while true; do curl -s http://localhost:18080/readings -X POST -H "Content-Type: application/json" -d '{"device_id":"AGRIBOT-SENSORS","temperature":25,"humidity":60,"soil_moisture":40,"smoke_raw":100,"smoke_detected":false,"flame_detected":false}' >/dev/null; sleep 0.3; done
```

> "Everything is observable. Prometheus scrapes the API's metrics; Grafana visualises them. Request rate, HTTP status codes, 95th-percentile latency — and down here, my custom panel: **sensor readings ingested**, climbing in real time as data arrives. If the system were unhealthy, I'd see it here first. That's section 4."

*(Stop the loop after filming: Ctrl-C.)*

---

## SCENE 5 — Kubernetes: scaling & SELF-HEALING (3:00 → 4:30) ⭐

**On screen:** Terminal 1 + Terminal 2 side by side. **This is the centrepiece — take your time.**

**Do (Terminal 1):**
```bash
sudo kubectl -n agribot get pods,hpa
```
> "The API runs on Kubernetes — two replicas, with a horizontal autoscaler set to scale up to five under load. Now the important part: **self-healing.**"

**Start the availability proof (Terminal 2):**
```bash
while true; do curl -s -o /dev/null -w "%{http_code} " http://localhost:30080/health; sleep 0.3; done
```
> "In this terminal I'm hitting the service continuously — you can see a stream of 200s. Now watch what happens when I **kill a pod**."

**Do (Terminal 1) — use a real pod name:**
```bash
sudo kubectl -n agribot delete pod <agribot-api-xxxxx>
sudo kubectl -n agribot get pods -w
```
> "I deleted a running pod. I did **not** restart it. Kubernetes sees that actual state — one pod — no longer matches desired state — two pods — and automatically creates a replacement. There it is: a **brand-new pod**, different name, coming up `ContainerCreating`... now `Running`. Back to two replicas, on its own."

**Point at Terminal 2:**
> "And notice — the request stream never stopped. Still all 200s. The second replica served every request while the first was rebuilt. That's **self-healing AND zero-downtime high availability**, proven at the same time. This is section 7 — the fifteen-mark section — live."

*(Optional flourish: `kubectl -n agribot delete pods --all` then `get pods -w` — the whole set rebuilds.)*

---

## SCENE 6 — CI/CD pipeline (4:30 → 5:30)

**On screen:** Jenkins Tab C.

> "Every code change goes through this Jenkins pipeline automatically." **Point at the green Stage View.** "Checkout, install, then **tests with an 80% coverage gate** — my suite hits 95%; if it ever dropped below 80 the build would fail and nothing would deploy. Then it builds the Docker image, deploys an isolated stack, and smoke-tests it. All six stages green."

**Click the Coverage Report link:**
> "Here's the published coverage report — 95%. That's section 6, testing, and section 3, CI/CD, both demonstrated on a real automated run."

---

## SCENE 7 — Infrastructure as Code + security (5:30 → 6:10)

**On screen:** Terminal 1 showing the `ansible/` files, then `ufw`.

```bash
ls ansible/
sudo ufw status | head
```
> "The entire server is reproducible from code — two Ansible playbooks install Docker, configure the firewall, and deploy the app. I could rebuild this on a fresh VPS in minutes. And it's secured: a default-deny firewall, with only the ports I need open, and Nginx as the single TLS entry point. Sections 5 and 1."

---

## SCENE 8 — Wrap-up (6:10 → 7:00)

**On screen:** you, or a summary slide listing the 10 sections.

> "So to recap what you just saw running live: a real sensor posting over HTTPS into a containerised, layered microservice backed by PostgreSQL; full monitoring in Grafana; Kubernetes auto-scaling and self-healing with zero downtime; an automated CI/CD pipeline with a coverage gate; and infrastructure defined entirely as code. Every architecture characteristic — scalability, availability, observability, testability, security — isn't just described in my report, it's demonstrable. The innovation is the offline-first design that makes AGRIBOT actually work where farms are: with no signal. Thank you."

---

## Timing cheat-sheet

| Scene | Topic | End time | Rubric |
|---|---|---|---|
| 1 | Intro / problem | 0:40 | context |
| 2 | Architecture | 1:20 | §8 |
| 3 | Live sensor → cloud | 2:20 | §1, §10 |
| 4 | Grafana monitoring | 3:00 | §4 |
| 5 | **K8s self-healing** ⭐ | 4:30 | §7 |
| 6 | CI/CD + coverage | 5:30 | §3, §6 |
| 7 | IaC + security | 6:10 | §5, §1 |
| 8 | Wrap-up | 7:00 | §8, §9 |

**Golden rules:** rehearse Scene 5 twice; keep each terminal command in your history (press ↑) so you don't type live; if something misbehaves, narrate calmly and move on — a recovered mistake looks *more* real. Record in 1080p; make the terminal font large.
