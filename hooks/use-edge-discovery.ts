/**
 * useEdgeDiscovery — finds the AGRI-PC edge hub on the local network via mDNS
 * (the `_agribot-edge._tcp` service advertised by agribot-edge/app/discovery.py).
 *
 * Returns the resolved IPv4 host + port so the app never needs a hardcoded IP —
 * it keeps working across router/network changes. A manually-entered address
 * (AppModeContext.edgeHost) always takes precedence over discovery.
 *
 * Native only (react-native-zeroconf). The web build uses RemoteCameraFeed.web.tsx,
 * which never imports this hook.
 */

import { useEffect, useState } from 'react';
import Zeroconf from 'react-native-zeroconf';

export interface EdgeService {
  host: string; // IPv4, e.g. "192.168.1.103"
  port: number; // 8000
  name: string;
}

// react-native-zeroconf scans by bare type; "_agribot-edge._tcp.local." → ("agribot-edge","tcp","local.")
const SERVICE_TYPE = 'agribot-edge';
const PROTOCOL = 'tcp';
const DOMAIN = 'local.';

const isIpv4 = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);

export function useEdgeDiscovery(enabled = true) {
  const [service, setService] = useState<EdgeService | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let zc: Zeroconf;
    try {
      zc = new Zeroconf();
    } catch {
      return; // native module not linked (e.g. running in Expo Go)
    }

    const onResolved = (svc: any) => {
      const addrs: string[] = svc?.addresses ?? [];
      const ipv4 = addrs.find((a) => a.includes('.') && !a.includes(':'));
      // Prefer a stable IPv4; fall back to the .local hostname if that's all mDNS
      // gives us (some devices report no address record, only the host name).
      const candidate = ipv4 ?? (svc?.host ? String(svc.host).replace(/\.$/, '') : undefined);
      if (!candidate) return;
      const port = svc?.port ?? 8000;
      setService((prev) => {
        if (!prev) return { host: candidate, port, name: svc?.name ?? 'AGRI-PC' };
        // Upgrade hostname -> IPv4 once; otherwise keep the SAME object so the
        // WebRTC peer isn't torn down and re-created on every mDNS re-resolve.
        if (ipv4 && prev.host !== ipv4 && !isIpv4(prev.host)) {
          return { host: ipv4, port, name: prev.name };
        }
        return prev;
      });
    };

    zc.on('resolved', onResolved);
    zc.on('error', (err: any) => console.warn('[edge-discovery]', err));

    setScanning(true);
    try {
      zc.scan(SERVICE_TYPE, PROTOCOL, DOMAIN);
    } catch (err) {
      console.warn('[edge-discovery] scan failed', err);
      setScanning(false);
    }

    return () => {
      try { zc.stop(); } catch {}
      try { zc.removeDeviceListeners(); } catch {}
      setScanning(false);
    };
  }, [enabled]);

  return { service, scanning };
}
