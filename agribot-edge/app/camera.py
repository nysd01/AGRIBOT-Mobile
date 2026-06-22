"""Processed camera pipeline for AGRI-PC.

Wraps the webcam video track (kept as an aiortc MediaPlayer so dshow device-by-name
still works) and adds, all in one place:
  • digital zoom (center crop + upscale)
  • face detection — draws boxes AND pans/tilts the camera to follow the face
    (manual remote control takes priority: any manual cam command pauses follow)
  • photo capture (JPEG) and video recording (MP4) to a media/ folder

A single module-level `pipeline` holds the shared state; the WebRTC track, the REST
endpoints, and the MQTT layer all talk to it.
"""

import asyncio
import logging
import threading
import time
from pathlib import Path

import cv2
import numpy as np
from av import VideoFrame
from aiortc.mediastreams import VideoStreamTrack

log = logging.getLogger("agribot.camera")

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_DIR.mkdir(exist_ok=True)

_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

ZOOM_MIN, ZOOM_MAX, ZOOM_STEP = 1.0, 4.0, 0.25
DETECT_EVERY = 3            # run detection every Nth frame (reuse boxes between)
FOLLOW_HZ = 5              # max pan/tilt commands per second
DEADZONE = 0.18            # |offset| below this from center = "centered"
MANUAL_PRIORITY_S = 3.0    # pause auto-follow this long after a manual cam command


class CameraPipeline:
    def __init__(self) -> None:
        self.zoom = 1.0
        self.facetrack = False
        self.show_boxes = True

        self._lock = threading.Lock()
        self._latest = None            # latest processed BGR frame (for capture)
        self._writer = None            # cv2.VideoWriter while recording
        self._writer_name = None
        self._recording = False

        self._publish = None           # callable(cmd: str) -> send pan/tilt over MQTT
        self._manual_until = 0.0
        self._last_follow = 0.0
        self._last_pub_cmd = ""
        self._last_pub_at = 0.0

        self._i = 0
        self._faces: list = []

    # ── controls ────────────────────────────────────────────────────────────
    def set_zoom(self, level: float) -> float:
        self.zoom = max(ZOOM_MIN, min(ZOOM_MAX, float(level)))
        return self.zoom

    def zoom_in(self) -> float:
        return self.set_zoom(self.zoom + ZOOM_STEP)

    def zoom_out(self) -> float:
        return self.set_zoom(self.zoom - ZOOM_STEP)

    def set_facetrack(self, on: bool) -> bool:
        self.facetrack = bool(on)
        return self.facetrack

    def set_publisher(self, fn) -> None:
        self._publish = fn

    def note_manual_cmd(self, cmd: str) -> None:
        """Called when a cam command is seen on the bus. Ours = ignore; else pause follow."""
        if cmd == self._last_pub_cmd and (time.time() - self._last_pub_at) < 0.3:
            return  # echo of our own follow command
        self._manual_until = time.time() + MANUAL_PRIORITY_S

    # ── frame processing (runs in a worker thread) ──────────────────────────
    def process(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]

        if self.zoom > 1.0:
            zw, zh = int(w / self.zoom), int(h / self.zoom)
            x0, y0 = (w - zw) // 2, (h - zh) // 2
            img = cv2.resize(img[y0:y0 + zh, x0:x0 + zw], (w, h), interpolation=cv2.INTER_LINEAR)

        if self.facetrack:
            self._i += 1
            if self._i % DETECT_EVERY == 0:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                self._faces = list(_CASCADE.detectMultiScale(gray, 1.2, 5, minSize=(60, 60)))
            if self._faces:
                fx, fy, fw, fh = max(self._faces, key=lambda f: f[2] * f[3])
                if self.show_boxes:
                    cv2.rectangle(img, (fx, fy), (fx + fw, fy + fh), (88, 201, 95), 2)
                self._follow(fx + fw / 2.0, fy + fh / 2.0, w, h)

        with self._lock:
            self._latest = img
            if self._recording and self._writer is not None:
                self._writer.write(img)
        return img

    def _follow(self, cx: float, cy: float, w: int, h: int) -> None:
        if self._publish is None or time.time() < self._manual_until:
            return
        now = time.time()
        if now - self._last_follow < 1.0 / FOLLOW_HZ:
            return
        dx = (cx - w / 2.0) / (w / 2.0)
        dy = (cy - h / 2.0) / (h / 2.0)
        # Mapping per firmware: CU/CD tilt up/down, CX/CY pan left/right, CS stop.
        if dy < -DEADZONE:
            cmd = "CU"
        elif dy > DEADZONE:
            cmd = "CD"
        elif dx < -DEADZONE:
            cmd = "CX"
        elif dx > DEADZONE:
            cmd = "CY"
        else:
            cmd = "CS"
        self._last_follow = now
        self._last_pub_cmd = cmd
        self._last_pub_at = now
        try:
            self._publish(cmd)
        except Exception as exc:
            log.debug("follow publish failed: %s", exc)

    # ── capture / record ────────────────────────────────────────────────────
    def capture_photo(self):
        with self._lock:
            if self._latest is None:
                return None
            name = f"photo_{time.strftime('%Y%m%d_%H%M%S')}.jpg"
            cv2.imwrite(str(MEDIA_DIR / name), self._latest)
            return name

    def start_recording(self, fps: int = 20):
        with self._lock:
            if self._recording:
                return self._writer_name
            if self._latest is None:
                return None
            h, w = self._latest.shape[:2]
            name = f"video_{time.strftime('%Y%m%d_%H%M%S')}.mp4"
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            self._writer = cv2.VideoWriter(str(MEDIA_DIR / name), fourcc, fps, (w, h))
            self._writer_name = name
            self._recording = True
            return name

    def stop_recording(self):
        with self._lock:
            if not self._recording:
                return None
            self._recording = False
            if self._writer is not None:
                self._writer.release()
                self._writer = None
            name, self._writer_name = self._writer_name, None
            return name

    def status(self) -> dict:
        return {
            "zoom": round(self.zoom, 2),
            "facetrack": self.facetrack,
            "recording": self._recording,
        }


pipeline = CameraPipeline()


class ProcessedVideoTrack(VideoStreamTrack):
    """Reads frames from the webcam source track and runs them through the pipeline."""

    def __init__(self, source) -> None:
        super().__init__()
        self.source = source

    async def recv(self) -> VideoFrame:
        frame = await self.source.recv()
        img = frame.to_ndarray(format="bgr24")
        out = await asyncio.to_thread(pipeline.process, img)
        new = VideoFrame.from_ndarray(out, format="bgr24")
        new.pts = frame.pts
        new.time_base = frame.time_base
        return new
