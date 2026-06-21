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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import db, webrtc
from .config import settings
from .discovery import Advertiser
from .mqtt_ingest import MqttIngest
from .sync import SyncAgent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("agribot.main")

ingest = MqttIngest()
syncer = SyncAgent()
advertiser = Advertiser()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    ingest.start()
    syncer.start()
    await advertiser.start()
    log.info("AGRI-PC edge hub up on %s:%s", settings.host, settings.port)
    try:
        yield
    finally:
        await advertiser.stop()
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
