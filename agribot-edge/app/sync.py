"""Background agent that pushes unsynced rows up to Supabase when internet is up.

Best-effort: failures (offline, auth, schema) are logged and retried next tick.
NOTE: adjust `_to_supabase()` to match your real Supabase `sensor_readings` columns.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from . import db
from .config import settings

log = logging.getLogger("agribot.sync")


def _to_supabase(row: dict[str, Any]) -> dict[str, Any]:
    iso = datetime.fromtimestamp(row["ts"] / 1000.0, tz=timezone.utc).isoformat()
    return {"created_at": iso, "esp_ip": row.get("espIP"), "data": row["data"]}


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
