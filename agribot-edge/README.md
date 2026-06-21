# AGRIBOT Edge — runs on **AGRI-PC** (Windows 11)

The on-robot edge hub that replaced the Raspberry Pi. One Python service does four jobs:

| Job | Endpoint / mechanism |
|-----|----------------------|
| **Camera + mic streaming** (WebRTC) | `POST /offer` — works online *and* offline |
| **Local command bus** | Mosquitto MQTT broker (separate install) |
| **Local database** | Postgres (`sensor_readings`, `command_log`) |
| **Cloud sync** | background agent → Supabase when internet is up |

## Architecture

```
ONLINE :  phone ──► HiveMQ MQTT ──► ESP32-Motors          (commands)
          phone ──► Supabase                              (data/analytics)
          phone ◄── AGRI-PC WebRTC (via STUN/TURN)        (camera + mic)

OFFLINE:  phone ──► AGRI-PC Mosquitto ──► ESP32-Motors    (commands)
          phone ──► AGRI-PC /snapshots (Postgres)         (data/analytics)
          phone ◄── AGRI-PC WebRTC (direct LAN)           (camera + mic)

sync agent:  Postgres(synced=false) ──► Supabase          (when internet up)
```

"Have both at once" works because AGRI-PC runs a **Wi-Fi hotspot** (phone + ESP32s join it)
*and* has upstream internet (Ethernet / 2nd Wi-Fi), so the phone reaches local + cloud together.

## Prerequisites (install on AGRI-PC)

1. **Python 3.11+** — <https://www.python.org/downloads/>
2. **FFmpeg** on PATH — aiortc uses it to capture the webcam/mic (DirectShow).
   List your device names with:
   ```powershell
   ffmpeg -list_devices true -f dshow -i dummy
   ```
   Put the exact `video=...` / `audio=...` names into `.env`.
3. **PostgreSQL 15+** — create the database and user:
   ```sql
   CREATE USER agribot WITH PASSWORD 'agribot';
   CREATE DATABASE agribot_edge OWNER agribot;
   ```
   (Tables are created automatically from `schema.sql` on first run.)
4. **Mosquitto** (local MQTT broker) — <https://mosquitto.org/download/>. Run it on `:1883`.

## Setup & run

```powershell
cd agribot-edge
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env      # then edit device names, DB url, Supabase key
.\run.ps1                    # or: uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Verify:  `http://localhost:8000/health` → `{"ok": true, ...}`

## Online streaming needs TURN

Offline (LAN) streaming works with STUN alone. For **online** — phone on cellular, AGRI-PC
behind NAT — direct P2P usually fails, so you must:
- set `TURN_URL` / `TURN_USERNAME` / `TURN_PASSWORD` (run your own `coturn`, or a managed
  TURN like Cloudflare/Metered/Twilio), **and**
- make `POST /offer` reachable from the internet (Cloudflare Tunnel or ngrok pointed at `:8000`).

## Status / next phases

- [x] Phase 1 — service skeleton: `/health`, `/offer` (WebRTC), `/snapshots`, Postgres, MQTT ingest, sync agent
- [x] mDNS discovery — advertises `_agribot-edge._tcp` / `agribot-edge.local` so the phone finds AGRI-PC with no hardcoded IP (`app/discovery.py`)
- [ ] Phase 2 — phone side: `react-native-webrtc` + `react-native-zeroconf` dev build + `RemoteCameraFeed` (replaces the `CameraView` placeholder in `app/(tabs)/remote.tsx`)
- [ ] Phase 3 — `use-mqtt.ts` broker switch (online HiveMQ / offline Mosquitto) + ESP32s join AGRI-PC hotspot
- [ ] Phase 4 — analytics dual-source (`/snapshots` offline, Supabase online)
- [ ] Online signaling exposure (tunnel) + TURN provisioning
```
