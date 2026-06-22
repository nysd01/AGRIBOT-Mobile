"""AGRI-PC edge hub — FastAPI app.

Endpoints
  GET  /health      → liveness + ICE summary
  POST /offer       → WebRTC signaling (phone sends SDP offer, gets SDP answer)
  GET  /snapshots   → recent sensor readings (offline analytics source)
  POST /command     → log a command the phone issued (audit / analytics)

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import db, webrtc
from .camera import MEDIA_DIR, pipeline
from .config import settings
from .discovery import Advertiser
from .mqtt_ingest import MqttIngest
from .poller import SensorPoller
from .sync import SyncAgent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("agribot.main")

ingest = MqttIngest()
syncer = SyncAgent()
advertiser = Advertiser()
poller = SensorPoller()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    ingest.start()
    syncer.start()
    poller.start()
    await advertiser.start()
    log.info("AGRI-PC edge hub up on %s:%s", settings.host, settings.port)
    try:
        yield
    finally:
        await advertiser.stop()
        poller.stop()
        syncer.stop()
        ingest.stop()
        await webrtc.close_all()
        await db.close_pool()


app = FastAPI(title="AGRIBOT Edge (AGRI-PC)", lifespan=lifespan)

# The phone app calls this from a different origin; allow all (LAN service).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Offer(BaseModel):
    sdp: str
    type: str


class Command(BaseModel):
    command: str
    source: str = "phone"
    mode: str = "offline"


class ZoomIn(BaseModel):
    level: float | None = None


class FaceTrackIn(BaseModel):
    on: bool


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "agribot-edge", "ice": webrtc.ice_summary()}


@app.post("/offer")
async def offer(body: Offer) -> dict:
    sdp, type_ = await webrtc.handle_offer(body.sdp, body.type)
    return {"sdp": sdp, "type": type_}


@app.get("/snapshots")
async def snapshots(limit: int = 100) -> dict:
    return {"snapshots": await db.recent_readings(limit)}


@app.post("/command")
async def command(body: Command) -> dict:
    await db.log_command(body.command, body.source, body.mode)
    return {"ok": True}


# ── Camera: zoom / face-track / capture / recording ─────────────────────────────

@app.get("/camera/status")
async def camera_status() -> dict:
    return pipeline.status()


@app.post("/zoom")
async def zoom(body: ZoomIn) -> dict:
    if body.level is not None:
        return {"zoom": pipeline.set_zoom(body.level)}
    return {"zoom": pipeline.zoom}


@app.post("/zoom/in")
async def zoom_in() -> dict:
    return {"zoom": pipeline.zoom_in()}


@app.post("/zoom/out")
async def zoom_out() -> dict:
    return {"zoom": pipeline.zoom_out()}


@app.post("/facetrack")
async def facetrack(body: FaceTrackIn) -> dict:
    return {"facetrack": pipeline.set_facetrack(body.on)}


@app.post("/capture/photo")
async def capture_photo() -> dict:
    name = pipeline.capture_photo()
    if not name:
        raise HTTPException(status_code=503, detail="no camera frame yet")
    return {"file": name}


@app.post("/record/start")
async def record_start() -> dict:
    name = pipeline.start_recording(settings.video_framerate)
    if not name:
        raise HTTPException(status_code=503, detail="no camera frame yet")
    return {"recording": True, "file": name}


@app.post("/record/stop")
async def record_stop() -> dict:
    return {"recording": False, "file": pipeline.stop_recording()}


# ── Media gallery ───────────────────────────────────────────────────────────────

@app.get("/media")
async def media_list() -> dict:
    items = []
    for p in sorted(MEDIA_DIR.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".mp4"):
            st = p.stat()
            items.append({
                "name": p.name,
                "type": "video" if p.suffix.lower() == ".mp4" else "photo",
                "size": st.st_size,
                "ts": int(st.st_mtime * 1000),
            })
    return {"media": items}


@app.get("/media/{name}")
async def media_file(name: str):
    target = (MEDIA_DIR / name).resolve()
    # Prevent path traversal — must stay inside MEDIA_DIR.
    if not str(target).startswith(str(MEDIA_DIR.resolve())) or not target.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(str(target))
