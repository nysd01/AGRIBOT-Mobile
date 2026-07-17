"""Database table + API schemas for a sensor reading."""

from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from .database import Base


# ── SQLAlchemy table ────────────────────────────────────────────────────────────
class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True, default="AGRIBOT-SENSORS")
    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    soil_moisture = Column(Float, nullable=True)
    smoke_raw = Column(Integer, nullable=True)
    smoke_detected = Column(Boolean, default=False)
    flame_detected = Column(Boolean, default=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )


# ── API schemas (Pydantic) ──────────────────────────────────────────────────────
class ReadingIn(BaseModel):
    device_id: str = "AGRIBOT-SENSORS"
    temperature: float | None = None
    humidity: float | None = None
    soil_moisture: float | None = None
    smoke_raw: int | None = None
    smoke_detected: bool = False
    flame_detected: bool = False


class ReadingOut(ReadingIn):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}  # allow ORM object -> schema
