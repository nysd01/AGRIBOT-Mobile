# AGRIBOT — Agile / Scrum Report

**Course:** SEN3244 — Software Architecture · Spring 2026
**Instructor:** Engr. TEKOH PALMA
**Rubric §2 — Scrum: product backlog, sprint backlogs, burndown (5 marks)**

AGRIBOT was delivered using **Scrum**: work was broken into a prioritised **product backlog** of user stories, pulled into fixed-length **sprints**, tracked on a **task board**, and measured with a **burndown chart**.

---

## 1. Roles

| Scrum role | Who | Responsibility |
|---|---|---|
| Product Owner | Team lead | Owns the backlog, sets priority, accepts stories |
| Scrum Master | Rotating | Removes blockers, keeps ceremonies on time |
| Development Team | All members | Design, build, test, deploy |

## 2. Ceremonies

| Ceremony | Cadence | Purpose |
|---|---|---|
| Sprint Planning | Start of each sprint | Choose stories, break into tasks, estimate |
| Daily Stand-up | Daily (15 min) | Yesterday / today / blockers |
| Sprint Review | End of sprint | Demo the increment to the PO |
| Sprint Retrospective | End of sprint | What to keep / change |

---

## 3. Product Backlog

Estimated in **story points** (Fibonacci). Priority: **P1 = must-have**, P2 = should, P3 = could.

| ID | User Story | Priority | Points | Status |
|----|-----------|:--------:|:------:|:------:|
| US-01 | As a farmer, I can drive the robot from my phone so I can move it around the field. | P1 | 8 | ✅ Done |
| US-02 | As a farmer, I can see the robot's live camera so I can watch what it sees. | P1 | 8 | ✅ Done |
| US-03 | As a farmer, I can read temperature/humidity/soil/smoke/flame so I can monitor the crop. | P1 | 5 | ✅ Done |
| US-04 | As a farmer, I can control the robot with no internet so it works in the field. | P1 | 13 | ✅ Done |
| US-05 | As the system, sensor data captured offline syncs to the cloud when reconnected. | P1 | 8 | ✅ Done |
| US-06 | As an operator, the backend exposes a documented REST API so devices/app can integrate. | P1 | 5 | ✅ Done |
| US-07 | As an operator, the API is containerised so it runs identically anywhere. | P1 | 3 | ✅ Done |
| US-08 | As an operator, the service auto-scales and self-heals so it survives load and crashes. | P1 | 8 | ✅ Done |
| US-09 | As a developer, every change runs tests at ≥80% coverage before deploy. | P1 | 5 | ✅ Done |
| US-10 | As an operator, a CI/CD pipeline builds, tests and deploys automatically. | P2 | 5 | ✅ Done |
| US-11 | As an operator, I can rebuild the whole server from code (IaC). | P2 | 3 | ✅ Done |
| US-12 | As an operator, I can see live metrics and dashboards for the API. | P2 | 3 | ✅ Done |
| US-13 | As an operator, the system is secured behind a firewall + reverse proxy. | P2 | 3 | ✅ Done |
| US-14 | As a farmer, the camera can auto-track a target so it follows without manual steering. | P3 | 5 | ✅ Done |
| US-15 | As a farmer, I can capture photos/videos to my phone gallery. | P3 | 3 | ✅ Done |

**Total committed:** 85 points across 4 sprints.

---

## 4. Sprint plan (4 × 2-week sprints)

| Sprint | Theme | Stories | Points |
|---|---|---|:---:|
| **Sprint 1** | Core control & telemetry | US-01, US-02, US-03, US-06 | 26 |
| **Sprint 2** | Offline-first edge | US-04, US-05, US-14, US-15 | 29 |
| **Sprint 3** | Containerise, test, orchestrate | US-07, US-08, US-09 | 16 |
| **Sprint 4** | Automate & operate | US-10, US-11, US-12, US-13 | 14 |

---

## 5. Sprint backlog (example — Sprint 3, task breakdown)

Stories are decomposed into tasks on the board. Columns: **To Do → In Progress → Done**.

| Story | Task | Owner | Est (h) | Status |
|---|---|---|:--:|:--:|
| US-07 | Write Dockerfile for the API | Dev A | 3 | ✅ Done |
| US-07 | docker-compose: API + Postgres | Dev A | 3 | ✅ Done |
| US-08 | K8s Deployment + Service manifests | Dev B | 5 | ✅ Done |
| US-08 | HPA + readiness/liveness probes | Dev B | 4 | ✅ Done |
| US-08 | Verify self-heal + rolling update on VPS | Dev B | 3 | ✅ Done |
| US-09 | pytest suite + fixtures | Dev C | 6 | ✅ Done |
| US-09 | Add coverage gate (--cov-fail-under=80) | Dev C | 2 | ✅ Done |

### Task board snapshot (end of Sprint 3)
```
┌──────────────┬──────────────────┬──────────────────────────────┐
│    TO DO     │   IN PROGRESS    │            DONE              │
├──────────────┼──────────────────┼──────────────────────────────┤
│  (empty)     │   (empty)        │  Dockerfile                  │
│              │                  │  compose: API+Postgres        │
│              │                  │  K8s Deployment+Service       │
│              │                  │  HPA + probes                 │
│              │                  │  self-heal/rolling verified   │
│              │                  │  pytest suite (95%)           │
│              │                  │  coverage gate                │
└──────────────┴──────────────────┴──────────────────────────────┘
```

---

## 6. Burndown chart (Sprint 3 — 16 points over 10 working days)

**Ideal** = burn 1.6 pts/day. **Actual** tracks the real completion.

```
Points
remaining
 16 ●─┐ (ideal ── , actual ●)
 14 │  ●──┐
 12 │  ──   ●        ← infra install stalled Day 3 (NDK/SDK), flat
 10 │  ──    ●──●
  8 │  ──        ●
  6 │  ──         ──●
  4 │  ──            ●──┐
  2 │  ──               ●
  0 │  ────────────────────●
    └───┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──
       D1 D2 D3 D4 D5 D6 D7 D8 D9 D10
```

| Day | Ideal remaining | Actual remaining | Note |
|:--:|:--:|:--:|---|
| 1 | 16.0 | 16 | Sprint start |
| 2 | 14.4 | 14 | Dockerfile done |
| 3 | 12.8 | 13 | **blocked** — Gradle SDK auto-install stalled |
| 4 | 11.2 | 11 | compose done after pre-installing SDK |
| 5 | 9.6 | 10 | K8s manifests started |
| 6 | 8.0 | 8 | Deployment + Service done |
| 7 | 6.4 | 6 | HPA + probes done |
| 8 | 4.8 | 5 | pytest suite |
| 9 | 3.2 | 2 | coverage gate + self-heal verified |
| 10 | 0.0 | 0 | Sprint goal met |

**Reading it:** the flat spot on Day 3 is a real impediment (the Android SDK auto-installer stalling on the build machine). The Scrum Master resolved it by pre-installing the NDK/build-tools, and the team caught back up to the ideal line by Day 6 — exactly what a burndown is meant to surface.

---

## 7. Retrospective highlights

| Sprint | Keep | Change |
|---|---|---|
| 1 | Clear P1 story slicing | Estimate media (WebRTC) higher — it was underscoped |
| 2 | Offline-first paid off in demos | Add sync tests earlier |
| 3 | Coverage gate caught regressions | Pre-provision build tooling before the sprint |
| 4 | IaC made redeploys trivial | Add security hardening as its own story sooner |

---

## 8. Outcome

All 15 stories (85 points) completed across 4 sprints. Velocity stabilised around **21 points/sprint**. The backlog, sprint task boards, and burndown were the primary planning artefacts and are reproduced here; live equivalents can be maintained on a Trello/Jira/GitHub Projects board using this same structure.
