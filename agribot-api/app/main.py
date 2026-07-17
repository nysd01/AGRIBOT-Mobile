"""AGRIBOT Sensor API.

A small, layered microservice:
  • Presentation — FastAPI REST endpoints (+ auto Swagger at /docs)
  • Business     — request handling / validation
  • Data         — SQLAlchemy models + PostgreSQL (SQLite in dev/test)

The ESP32-Sensor POSTs readings here; the mobile app GETs them. `/metrics` is
scraped by Prometheus.
"""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import desc
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import Base, engine, get_db

# Create tables on startup (idempotent).
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Ingest and serve AGRIBOT ESP32 sensor readings. Interactive docs at /docs.",
)

# Expose Prometheus metrics at /metrics (request count, latency, etc.).
Instrumentator().instrument(app).expose(app)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["system"])
def health() -> dict:
    """Liveness probe — used by Kubernetes and monitoring."""
    return {"status": "ok", "service": "agribot-api", "version": settings.api_version}


@app.post("/readings", response_model=models.ReadingOut, status_code=201, tags=["readings"])
def create_reading(reading: models.ReadingIn, db: Session = Depends(get_db)):
    """Ingest one sensor reading (called by the ESP32-Sensor)."""
    row = models.SensorReading(**reading.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/readings", response_model=list[models.ReadingOut], tags=["readings"])
def list_readings(limit: int = 50, db: Session = Depends(get_db)):
    """Most-recent readings first (called by the mobile app / analytics)."""
    limit = max(1, min(limit, 500))
    return (
        db.query(models.SensorReading)
        .order_by(desc(models.SensorReading.created_at))
        .limit(limit)
        .all()
    )


@app.get("/readings/latest", response_model=models.ReadingOut, tags=["readings"])
def latest_reading(db: Session = Depends(get_db)):
    """The single most recent reading."""
    row = (
        db.query(models.SensorReading)
        .order_by(desc(models.SensorReading.created_at))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="no readings yet")
    return row
