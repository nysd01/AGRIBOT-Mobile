"""ESP32-Sensors HTTP poller → local Postgres.

Bridges the gap that ESP32-Sensors publishes to Supabase / serves HTTP but does NOT
publish to the local MQTT `agribot/sensors` topic. AGRI-PC pulls
`GET http://<host>/sensors` every few seconds and inserts each reading into
`sensor_readings`; the sync agent then pushes it up to Supabase.

Disabled when ESP_SENSORS_HOST is empty.
"""

import asyncio
import logging
import time

import httpx

from . import db
from .config import settings

log = logging.getLogger("agribot.poller")


class SensorPoller:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if not settings.esp_sensors_host:
            log.info("sensor poller disabled (ESP_SENSORS_HOST is empty)")
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        host = settings.esp_sensors_host
        url = f"http://{host}/sensors"
        interval = settings.sensors_poll_interval_s
        log.info("sensor poller → %s every %ss", url, interval)
        ok_streak = False
        async with httpx.AsyncClient(timeout=5) as client:
            while not self._stop.is_set():
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    data = resp.json()
                    await db.insert_reading({"ts": int(time.time() * 1000), "espIP": host, "data": data})
                    if not ok_streak:
                        log.info("sensor poller connected to %s", host)
                        ok_streak = True
                except Exception as exc:
                    if ok_streak:
                        log.warning("sensor poll failing (%s): %s", host, exc)
                        ok_streak = False
                    else:
                        log.debug("sensor poll failed: %s", exc)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    pass

    def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            self._task = None
