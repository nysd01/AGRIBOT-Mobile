/**
 * useEdgeBaseUrl — the active base URL for talking to the AGRI-PC edge service
 * (camera control, capture, recording, gallery, WebRTC signaling).
 *
 *   ONLINE  → the public tunnel URL (streamConfig.onlineUrl)
 *   OFFLINE → http://<AGRI-PC>:8000, where the host is the manual override
 *             (edgeHost) or the mDNS-discovered address.
 *
 * Returns null until a target is known (no manual host + nothing discovered yet,
 * or online with no tunnel configured).
 */

import { useAppMode } from '@/context/AppModeContext';
import { useEdgeDiscovery } from '@/hooks/use-edge-discovery';

export function useEdgeBaseUrl(): { baseUrl: string | null; isOnlineMode: boolean } {
  const { edgeHost, streamConfig, isOnlineMode } = useAppMode();
  const { service } = useEdgeDiscovery(!isOnlineMode);

  const lanHost = edgeHost || service?.host || null;
  const lanPort = service?.port ?? 8000;

  const baseUrl = isOnlineMode
    ? streamConfig?.onlineUrl?.trim() || null
    : lanHost
      ? `http://${lanHost}:${lanPort}`
      : null;

  return { baseUrl, isOnlineMode };
}
