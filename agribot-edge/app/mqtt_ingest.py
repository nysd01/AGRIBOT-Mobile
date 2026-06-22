"""Local Mosquitto bridge.

  • subscribes `agribot/sensors`     → persists readings to Postgres
  • subscribes `agribot/motors/cmd`  → watches for MANUAL camera commands so the
    face-tracker yields priority (its own follow commands are filtered out)
  • publishes the face-tracker's pan/tilt follow commands to `agribot/motors/cmd`

paho runs its network loop on a background thread; sensor writes are handed back to
the asyncio loop via run_coroutine_threadsafe.
"""

import asyncio
import json
import logging

import paho.mqtt.client as mqtt

from . import db
from .camera import pipeline
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
            pipeline.set_publisher(self._publish_cmd)  # let the face-tracker send pan/tilt
            log.info("MQTT ingest connecting to %s:%s", settings.mqtt_host, settings.mqtt_port)
        except Exception as exc:
            log.warning("MQTT connect failed (%s) — ingest disabled", exc)

    def _on_connect(self, client, userdata, flags, rc) -> None:
        log.info("MQTT connected rc=%s; subscribing %s + %s",
                 rc, settings.mqtt_sensors_topic, settings.mqtt_cmd_topic)
        client.subscribe(settings.mqtt_sensors_topic)
        client.subscribe(settings.mqtt_cmd_topic)

    def _on_message(self, client, userdata, msg) -> None:
        if msg.topic == settings.mqtt_cmd_topic:
            # Manual camera commands (CU/CD/CX/CY/CS) pause face-follow; the tracker's
            # own echoes are filtered inside note_manual_cmd().
            try:
                cmd = msg.payload.decode("utf-8").strip()
            except UnicodeDecodeError:
                return
            if cmd.startswith("C"):
                pipeline.note_manual_cmd(cmd)
            return

        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            log.debug("dropping non-JSON message on %s", msg.topic)
            return
        if self._loop is not None:
            asyncio.run_coroutine_threadsafe(db.insert_reading(payload), self._loop)

    def _publish_cmd(self, cmd: str) -> None:
        if self._client is not None:
            self._client.publish(settings.mqtt_cmd_topic, cmd, qos=0, retain=False)

    def stop(self) -> None:
        pipeline.set_publisher(None)
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None
