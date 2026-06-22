"""WebRTC sender: captures the AGRI-PC camera + mic and answers phone offers.

Works the same in both modes — only the ICE servers differ:
  • OFFLINE: phone and AGRI-PC are on the hotspot LAN; host candidates connect directly.
  • ONLINE : phone is remote and AGRI-PC is behind NAT; STUN finds a path, and a
             TURN server (set TURN_URL etc.) relays media when direct P2P fails.

A single MediaRelay fans the one camera/mic out to every connected peer, so
multiple phones can watch without re-opening the device.
"""

import asyncio
import logging

from aiortc import (
    RTCConfiguration,
    RTCIceServer,
    RTCPeerConnection,
    RTCSessionDescription,
)
from aiortc.contrib.media import MediaPlayer, MediaRelay

from .config import settings

log = logging.getLogger("agribot.webrtc")

_pcs: set[RTCPeerConnection] = set()
_relay: MediaRelay | None = None
_video_player: MediaPlayer | None = None
_audio_player: MediaPlayer | None = None
_media_lock = asyncio.Lock()


def ice_servers() -> list[RTCIceServer]:
    servers = [RTCIceServer(urls=[settings.stun_url])]
    if settings.turn_url:
        servers.append(
            RTCIceServer(
                urls=[settings.turn_url],
                username=settings.turn_username or None,
                credential=settings.turn_password or None,
            )
        )
    return servers


def ice_summary() -> dict:
    """ICE config without leaking the TURN credential — handy for /health."""
    return {"stun": settings.stun_url, "turn": bool(settings.turn_url)}


async def _ensure_media() -> tuple[object | None, object | None]:
    """Open the camera/mic once; return relay-backed tracks (video, audio)."""
    global _relay, _video_player, _audio_player
    async with _media_lock:
        if _relay is None:
            _relay = MediaRelay()

        if _video_player is None and settings.video_device:
            try:
                _video_player = MediaPlayer(
                    f"video={settings.video_device}",
                    format=settings.media_format,
                    options={
                        "framerate": str(settings.video_framerate),
                        "video_size": f"{settings.video_width}x{settings.video_height}",
                    },
                )
            except Exception as exc:  # bad device name / camera busy
                log.warning("camera open failed (%s): %s", settings.video_device, exc)

        if _audio_player is None and settings.audio_device:
            try:
                _audio_player = MediaPlayer(
                    f"audio={settings.audio_device}", format=settings.media_format
                )
            except Exception as exc:
                log.warning("mic open failed (%s): %s", settings.audio_device, exc)

    video = _relay.subscribe(_video_player.video) if _video_player and _video_player.video else None
    audio = _relay.subscribe(_audio_player.audio) if _audio_player and _audio_player.audio else None
    return video, audio


async def handle_offer(sdp: str, type_: str) -> tuple[str, str]:
    """Take the phone's SDP offer, attach camera/mic, return our SDP answer."""
    pc = RTCPeerConnection(RTCConfiguration(iceServers=ice_servers()))
    _pcs.add(pc)

    @pc.on("connectionstatechange")
    async def _on_state() -> None:
        log.info("peer connection state: %s", pc.connectionState)
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await pc.close()
            _pcs.discard(pc)

    video, audio = await _ensure_media()
    if video is not None:
        pc.addTrack(video)
    if audio is not None:
        pc.addTrack(audio)

    await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type=type_))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return pc.localDescription.sdp, pc.localDescription.type


async def close_all() -> None:
    await asyncio.gather(*(pc.close() for pc in list(_pcs)), return_exceptions=True)
    _pcs.clear()
