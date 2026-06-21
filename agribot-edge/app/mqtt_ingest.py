"""Subscribe to the local Mosquitto broker and persist sensor readings to Postgres.

paho runs its network loop on a background thread; each message is handed back to
the asyncio loop via run_coroutine_threadsafe so DB writes stay on the main loop.
"""

import asyncio
import json
import logging

import paho.mqtt.client as mqtt

from . import db
from .config import settings

log = logging.getLogger("agribot.mqtt")


class MqttIngest:
    def __init__(self) -> None:
        self._client: mqtt.Client | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        client = mqtt.Client()
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        try:
            client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
            client.loop_start()
            self._client = client
            log.info("MQTT ingest connecting to %s:%s", settings.mqtt_host, settings.mqtt_port)
        except Exception as exc:
            log.warning("MQTT connect failed (%s) — ingest disabled", exc)

    def _on_connect(self, client, userdata, flags, rc) -> None:
        log.info("MQTT connected rc=%s; subscribing %s", rc, settings.mqtt_sensors_topic)
        client.subscribe(settings.mqtt_sensors_topic)

    def _on_message(self, client, userdata, msg) -> None:
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            log.debug("dropping non-JSON message on %s", msg.topic)
            return
        if self._loop is not None:
            asyncio.run_coroutine_threadsafe(db.insert_reading(payload), self._loop)

    def stop(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None
