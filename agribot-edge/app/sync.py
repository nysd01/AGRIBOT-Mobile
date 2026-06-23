"""Background agent that pushes unsynced rows up to Supabase when internet is up.

Best-effort: failures (offline, auth, schema) are logged and retried next tick.
`_to_supabase()` maps a local /sensors reading to the flat `sensor_readings`
columns the ESP32 firmware already POSTs (postToCloud), so offline-collected rows
land in the same table, same shape.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from . import db
from .config import settings

log = logging.getLogger("agribot.sync")


def _g(d: dict, *keys) -> dict:
    """Safe nested-dict getter returning a dict ({} if any level is missing)."""
    cur: Any = d
    for k in keys:
        cur = (cur or {}).get(k) if isinstance(cur, dict) else None
    return cur if isinstance(cur, dict) else {}


def _to_supabase(row: dict[str, Any]) -> dict[str, Any]:
    """Map a local /sensors reading to the Supabase `sensor_readings` columns
    (the same shape the ESP32 firmware POSTs in postToCloud)."""
    d = row.get("data") or {}
    weather = _g(d, "domino4", "weather")
    soil = _g(d, "domino4", "soil")
    smoke = d.get("smoke") or {}
    flame = d.get("flame") or {}
    gps = _g(d, "location", "gps")
    sysinfo = d.get("systemInfo") or {}

    out: dict[str, Any] = {
        "device_id":   "AGRIBOT-SENSORS",
        "created_at":  datetime.fromtimestamp(row["ts"] / 1000.0, tz=timezone.utc).isoformat(),
        "temperature": d.get("temperatureC", weather.get("temperatureC")),
        "humidity":    d.get("humidityPct", weather.get("humidityPct")),
        "soil_moisture": d.get("soilMoisturePct", soil.get("moisturePct")),
        "smoke_raw":      smoke.get("raw"),
        "smoke_detected": smoke.get("detected"),
        "flame_raw":      flame.get("raw"),
        "flame_detected": flame.get("detected"),
        "gps_valid":      gps.get("valid"),
        "satellites":     gps.get("satellites"),
    }
    if gps.get("valid"):
        out["latitude"]   = gps.get("lat")
        out["longitude"]  = gps.get("lng")
        out["altitude"]   = gps.get("altitude")
        out["speed_kmph"] = gps.get("speed_kmph")
    if sysinfo.get("uptimeSeconds") is not None:
        out["uptime_ms"] = int(sysinfo["uptimeSeconds"]) * 1000

    # Drop nulls so Supabase column defaults apply and types aren't violated.
    return {k: v for k, v in out.items() if v is not None}


class SyncAgent:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        self._stop.clear()
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                if settings.supabase_url and settings.supabase_service_key:
                    await self._push_once()
            except Exception as exc:
                log.warning("sync tick failed: %s", exc)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=settings.sync_interval_s)
            except asyncio.TimeoutError:
                pass

    async def _push_once(self) -> None:
        rows = await db.unsynced_readings(100)
        if not rows:
            return
        url = f"{settings.supabase_url}/rest/v1/sensor_readings"
        headers = {
            "apikey": settings.supabase_service_key,
            "Authorization": f"Bearer {settings.supabase_service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=[_to_supabase(r) for r in rows], headers=headers)
            resp.raise_for_status()
        await db.mark_synced([r["id"] for r in rows])
        log.info("synced %d readings to Supabase", len(rows))

    def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            self._task = None
