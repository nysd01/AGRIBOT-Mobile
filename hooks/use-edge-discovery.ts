/**
 * useEdgeDiscovery — finds the AGRI-PC edge hub on the local network via mDNS
 * (the `_agribot-edge._tcp` service advertised by agribot-edge/app/discovery.py).
 *
 * Backed by a single shared Zeroconf scan (ref-counted) so multiple consumers
 * (camera feed, camera controls, gallery) reuse one scanner instead of each
 * spinning up its own. Returns the resolved IPv4 host + port; a manually-entered
 * address (AppModeContext.edgeHost) takes precedence in useEdgeBaseUrl.
 *
 * Native only (react-native-zeroconf). Web never imports this (RemoteCameraFeed.web).
 */

import { useEffect, useState } from 'react';
import Zeroconf from 'react-native-zeroconf';

export interface EdgeService {
  host: string; // IPv4, e.g. "192.168.1.103"
  port: number; // 8000
  name: string;
}

const SERVICE_TYPE = 'agribot-edge';
const PROTOCOL = 'tcp';
const DOMAIN = 'local.';

const isIpv4 = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);

// ── shared, ref-counted scanner ────────────────────────────────────────────────
let _zc: Zeroconf | null = null;
let _refs = 0;
let _service: EdgeService | null = null;
const _subs = new Set<(s: EdgeService | null) => void>();

function _emit() {
  _subs.forEach((fn) => fn(_service));
}

function _onResolved(svc: any) {
  const addrs: string[] = svc?.addresses ?? [];
  const ipv4 = addrs.find((a) => a.includes('.') && !a.includes(':'));
  const candidate = ipv4 ?? (svc?.host ? String(svc.host).replace(/\.$/, '') : undefined);
  if (!candidate) return;
  const port = svc?.port ?? 8000;
  if (!_service) {
    _service = { host: candidate, port, name: svc?.name ?? 'AGRI-PC' };
    _emit();
  } else if (ipv4 && _service.host !== ipv4 && !isIpv4(_service.host)) {
    // upgrade hostname -> IPv4 once; otherwise stay put (no churn)
    _service = { host: ipv4, port, name: _service.name };
    _emit();
  }
}

function _startScan() {
  try {
    _zc = new Zeroconf();
  } catch {
    return; // native module not linked (e.g. Expo Go)
  }
  _zc.on('resolved', _onResolved);
  _zc.on('error', (err: any) => console.warn('[edge-discovery]', err));
  try {
    _zc.scan(SERVICE_TYPE, PROTOCOL, DOMAIN);
  } catch (err) {
    console.warn('[edge-discovery] scan failed', err);
  }
}

function _stopScan() {
  try { _zc?.stop(); } catch {}
  try { _zc?.removeDeviceListeners(); } catch {}
  _zc = null;
}

export function useEdgeDiscovery(enabled = true) {
  const [service, setService] = useState<EdgeService | null>(_service);

  useEffect(() => {
    if (!enabled) return;
    const sub = (s: EdgeService | null) => setService(s);
    _subs.add(sub);
    _refs += 1;
    if (_refs === 1) _startScan();
    setService(_service); // sync with whatever's already resolved
    return () => {
      _subs.delete(sub);
      _refs -= 1;
      if (_refs === 0) _stopScan();
    };
  }, [enabled]);

  return { service, scanning: _refs > 0 };
}
