# AGRIBOT — User Manual

**Course:** SEN3244 — Software Architecture · Spring 2026
**Instructor:** Engr. TEKOH PALMA
**Rubric §10 — Documentation (user manual)**

This manual is written for three audiences: the **farmer** (end user of the app), the **operator** (who deploys and runs the backend), and the **evaluator** (who wants to verify each capability). Start at the section for your role.

---

## Part A — For the Farmer (using the app)

### A.1 What AGRIBOT does for you
AGRIBOT is a field robot you control from your phone. You can:
- **Drive** the robot around the field.
- **Watch** its live camera (and let it auto-follow a target).
- **Read** environmental sensors: temperature, humidity, soil moisture, smoke, and flame alerts.

It works **two ways automatically** — over the internet when you have signal, and over local Wi-Fi when you don't. You never have to choose; the app picks the working path.

### A.2 Getting started
1. Power on the robot (ESP32 nodes) and the edge hub (the on-site laptop).
2. Open the **AGRIBOT app** on your phone.
3. On the home screen you'll see connection status (Online / Local).
4. Tap **Remote** to drive, **Camera** to view the video, or **Sensors** to read the field data.

### A.3 Reading the sensors
The **Sensors** tab shows the latest values. Watch for:

| Reading | Normal | Alert means |
|---|---|---|
| Temperature | field-dependent | unusually high → heat stress / fire risk |
| Humidity | field-dependent | very low → dry conditions |
| Soil moisture | higher = wetter | low → the crop needs water |
| Smoke detected | `false` | `true` → possible fire, investigate now |
| Flame detected | `false` | `true` → **fire — act immediately** |

### A.4 If you lose internet in the field
Nothing to do. As long as your phone is on the **same Wi-Fi** as the edge hub, driving, camera, and sensors keep working locally. Data collected offline is **automatically uploaded** to the cloud once you're back online — you won't lose any readings.

---

## Part B — For the Operator (running the backend)

### B.1 Prerequisites
- A Linux VPS (Ubuntu) with SSH access.
- Docker + docker-compose (installed automatically by the Ansible provision playbook).
- The repository cloned: `git clone https://github.com/nysd01/AGRIBOT-Mobile.git`.

### B.2 Fastest path — run everything with Docker
```bash
cd AGRIBOT-Mobile/agribot-api
cp .env.example .env
docker compose up -d --build
```
Verify:
```bash
curl http://localhost:18080/health         # -> {"status":"ok",...}
```
Now open:
- **API / Swagger:** `http://<server>:18080/docs`
- **Grafana:** `http://<server>:13000` (admin / admin)
- **Prometheus:** `http://<server>:19090`

### B.3 Production path — Kubernetes (k3s)
```bash
# one-time: install k3s
curl -sfL https://get.k3s.io | sh -

# build & load the image into k3s
docker build -t agribot-api:latest .
docker save agribot-api:latest | sudo k3s ctr images import -

# deploy
kubectl apply -f k8s/
kubectl -n agribot get pods,svc,hpa
```
The API is now on `http://<server>:30080/docs`, running 2–5 self-healing, auto-scaling replicas.

### B.4 Reproducible setup with Ansible (no manual steps)
From your laptop:
```bash
cd agribot-api/ansible
pip install ansible
ansible-galaxy collection install community.general
ansible-playbook -i inventory.ini playbook-provision.yml --ask-pass   # installs Docker, firewall, clones repo
ansible-playbook -i inventory.ini playbook-deploy.yml   --ask-pass    # deploys and health-checks
```

### B.5 Connecting the devices
- **ESP32 sensor node** — configure it to `POST` JSON to `http://<server>:18080/readings`:
  ```json
  {"device_id":"esp32-sensor-01","temperature":27.4,"humidity":61.2,
   "soil_moisture":430,"smoke_raw":120,"smoke_detected":false,"flame_detected":false}
  ```
- **Mobile app** — point its API base URL at `http://<server>:18080` (or `:30080` for k8s).

### B.6 Routine operations
| Task | Command |
|---|---|
| View live logs | `docker compose logs -f api` |
| Restart the API | `docker compose restart api` |
| Update to latest code | `git pull && docker compose up -d --build` |
| Scale replicas (k8s) | `kubectl -n agribot scale deploy/agribot-api --replicas=3` |
| Watch autoscaling | `kubectl -n agribot get hpa -w` |
| Check pod health | `kubectl -n agribot get pods` |

### B.7 Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` unreachable | container not up / port blocked | `docker compose ps`; open the port in `ufw` |
| App shows no sensor data | ESP32 not POSTing / wrong URL | check device URL; `curl` a test reading (B.2) |
| `/readings/latest` returns 404 | no readings ingested yet | POST one reading first |
| Grafana empty | Prometheus not scraping | confirm `/metrics` responds; check `monitoring/prometheus.yml` |
| Pod stuck `CrashLoopBackOff` | bad config / DB unreachable | `kubectl -n agribot logs <pod>`; verify `postgres` Service |

---

## Part C — For the Evaluator (verifying each capability)

Run these to confirm each rubric capability is real and live:

| Capability | Command | Expected |
|---|---|---|
| API + Swagger (§10) | open `/docs` | interactive endpoint list |
| Testing 80%+ (§6) | `pytest` | 10 passed, coverage **95%** |
| Containerisation (§7) | `docker compose up` | 4 services healthy |
| K8s scaling (§7) | `kubectl -n agribot get hpa` | `2→5, target cpu 70%` |
| Self-healing (§7) | `kubectl -n agribot delete pod <name>` then `get pods` | pod recreated in ~12 s |
| Rolling update (§7) | `kubectl -n agribot rollout status deploy/agribot-api` | *successfully rolled out* |
| Service discovery (§7) | `kubectl -n agribot get svc` | `postgres` ClusterIP resolvable by name |
| CI/CD (§3) | run the Jenkins pipeline | green build, coverage published |
| IaC (§5) | run the two Ansible playbooks | host provisioned + app deployed |
| Monitoring (§4) | open Grafana | live "AGRIBOT API — Monitoring" dashboard |

---

## Appendix — Quick reference card

```
Local dev API      http://localhost:8000/docs
Docker API         http://<server>:18080/docs
Kubernetes API     http://<server>:30080/docs
Grafana            http://<server>:13000   (admin/admin)
Prometheus         http://<server>:19090
Health check       GET  /health
Ingest reading     POST /readings
Latest reading     GET  /readings/latest
Run tests          pytest
Deploy (compose)   docker compose up -d --build
Deploy (k8s)       kubectl apply -f k8s/
```
