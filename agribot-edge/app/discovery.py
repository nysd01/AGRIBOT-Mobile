"""mDNS / Bonjour advertiser so the phone finds AGRI-PC without a hardcoded IP.

Publishes a `_agribot-edge._tcp` service and maps the name `agribot-edge.local`
to AGRI-PC's current LAN IP. The phone discovers this (react-native-zeroconf),
resolves the real IP, and points all offline endpoints at it — so changing the
router/network needs zero edits in the app.

Uses the ASYNC zeroconf API (AsyncZeroconf): the sync `Zeroconf` facade blocks
the running asyncio loop long enough to trip zeroconf's EventLoopBlocked guard.
"""

import logging
import socket

from zeroconf import ServiceInfo
from zeroconf.asyncio import AsyncZeroconf

from .config import settings

log = logging.getLogger("agribot.discovery")

SERVICE_TYPE = "_agribot-edge._tcp.local."
SERVICE_NAME = "AGRI-PC Edge._agribot-edge._tcp.local."
HOSTNAME = "agribot-edge.local."


def _primary_ip() -> str:
    """Best-guess LAN IP (the interface that routes outbound traffic)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


class Advertiser:
    def __init__(self) -> None:
        self._aiozc: AsyncZeroconf | None = None
        self._info: ServiceInfo | None = None

    async def start(self) -> None:
        try:
            ip = _primary_ip()
            self._info = ServiceInfo(
                SERVICE_TYPE,
                SERVICE_NAME,
                addresses=[socket.inet_aton(ip)],
                port=settings.port,
                properties={"service": "agribot-edge", "health": "/health"},
                server=HOSTNAME,
            )
            self._aiozc = AsyncZeroconf()
            # allow_name_change: if a stale registration from an unclean previous
            # shutdown still lingers, append a suffix instead of raising
            # NonUniqueNameException (whose str() is empty → blank logs).
            await self._aiozc.async_register_service(self._info, allow_name_change=True)
            log.info("mDNS: %s advertised at %s:%s (%s)", SERVICE_TYPE, ip, settings.port, HOSTNAME)
        except Exception as exc:  # never let discovery block the service
            log.warning("mDNS advertise failed: %r", exc)  # %r shows the type even when str() is empty
            await self._safe_close()

    async def stop(self) -> None:
        try:
            if self._aiozc is not None and self._info is not None:
                await self._aiozc.async_unregister_service(self._info)
        except Exception:
            pass
        await self._safe_close()

    async def _safe_close(self) -> None:
        try:
            if self._aiozc is not None:
                await self._aiozc.async_close()
        except Exception:
            pass
        finally:
            self._aiozc = None
            self._info = None
