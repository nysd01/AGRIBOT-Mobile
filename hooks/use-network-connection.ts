import { useEffect, useRef, useState, useCallback } from 'react';
import * as Network from 'expo-network';

export interface NetworkInfo {
  ip?: string;
  ssid?: string;         // may be null on Android without Location permission
  isWifi: boolean;
  isConnected: boolean;
}

export function useNetworkInfo() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);

  const fetchNetworkInfo = useCallback(async () => {
    try {
      // Only show the spinner on the very first fetch; subsequent polls are silent
      // so the brief ActivityIndicator↔StatusBadge swap doesn't cause scroll jumps.
      if (firstLoad.current) setLoading(true);

      const state = await Network.getNetworkStateAsync();
      const isConnected = state.isConnected ?? false;
      const isWifi      = state.type === Network.NetworkStateType.WIFI;

      // Get IP whenever connected (WiFi OR mobile hotspot)
      let ip: string | undefined;
      if (isConnected) {
        try {
          const raw = await Network.getIpAddressAsync();
          // '0.0.0.0' means not actually bound yet
          if (raw && raw !== '0.0.0.0') ip = raw;
        } catch {
          // ignore — IP not critical
        }
      }

      // SSID is only available on WiFi; Android also needs ACCESS_FINE_LOCATION
      // If it's missing we still show the phone as connected.
      const ssid: string | undefined =
        isWifi ? ((state.details as any)?.ssid ?? undefined) : undefined;

      const next: NetworkInfo = isConnected
        ? { ip, ssid, isWifi, isConnected }
        : { isWifi: false, isConnected: false };

      // Only update state when something actually changed — prevents re-renders
      // every 4 s when the network hasn't changed, which would otherwise cause
      // the whole screen to re-render and the ScrollView to jump.
      setNetworkInfo(prev => {
        if (
          prev?.ip          === next.ip &&
          prev?.ssid        === next.ssid &&
          prev?.isWifi      === next.isWifi &&
          prev?.isConnected === next.isConnected
        ) return prev;
        return next;
      });
    } catch (err) {
      console.warn('[NetworkInfo]', err);
      // On error still try to get the IP so we're not completely blind
      try {
        const ip = await Network.getIpAddressAsync();
        if (ip && ip !== '0.0.0.0') {
          setNetworkInfo(prev =>
            prev?.ip === ip && prev?.isConnected ? prev : { ip, isWifi: true, isConnected: true }
          );
          return;
        }
      } catch {}
      setNetworkInfo(prev =>
        prev?.isConnected === false && !prev?.isWifi ? prev : { isWifi: false, isConnected: false }
      );
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void fetchNetworkInfo();
    const id = setInterval(() => void fetchNetworkInfo(), 4000);
    return () => clearInterval(id);
  }, [fetchNetworkInfo]);

  return { networkInfo, loading, refetch: fetchNetworkInfo };
}

// ─── ESP32 connection hook ───────────────────────────────────────────────────

export function useESP32Connection() {
  const [espIP, setEspIP] = useState<string>('192.168.4.1');
  const [isConnectedToESP, setIsConnectedToESP] = useState(false);
  const [espName, setEspName] = useState<string>('');
  const [espStaIP, setEspStaIP] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkESP32Availability = useCallback(
    async (ip: string = espIP): Promise<boolean> => {
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 8000); // 8 s — router adds latency
        const res  = await fetch(`http://${ip}/health`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json() as { name?: string; staIP?: string };
          setIsConnectedToESP(true);
          setEspName(data.name ?? 'AGRIBOT-ESP');
          setEspStaIP(data.staIP ?? null);
          setEspIP(ip);
          setError(null);
          return true;
        }
        setIsConnectedToESP(false);
        setError(`HTTP ${res.status} from ${ip}`);
      } catch (err) {
        setIsConnectedToESP(false);
        // AbortError = timeout, not an application error — show in UI but skip log
        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' || (err.message ?? '').toLowerCase().includes('abort'));
        if (!isAbort) {
          setError(err instanceof Error ? err.message : 'Unable to reach ESP32');
        } else {
          setError(`Timeout — ESP32 not found at ${ip}`);
        }
      }
      return false;
    },
    [espIP]
  );

  const sendWifiConfig = useCallback(
    async (ssid: string, password: string): Promise<void> => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 8000);
      const res  = await fetch(`http://${espIP}/wifi-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    [espIP]
  );

  const setCustomEspIP = useCallback((newIp: string) => {
    // Only reset connection state when the IP actually changes to a different
    // address. Using a setter-updater so we can compare against current value
    // without adding espIP to deps (which would make this callback unstable).
    setEspIP(prev => {
      if (prev !== newIp.trim()) {
        setIsConnectedToESP(false);
        setError(null);
      }
      return newIp.trim();
    });
  }, []);

  /**
   * Send cloud server URL + API key to the ESP32 so it can POST sensor data
   * directly to the cloud when it has internet access.
   * Firmware endpoint: POST /cloud-config  { url, key }
   */
  const sendCloudConfig = useCallback(
    async (serverUrl: string, apiKey: string): Promise<void> => {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 8000);
      const res  = await fetch(`http://${espIP}/cloud-config`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: serverUrl, key: apiKey }),
        signal:  ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    [espIP],
  );

  return {
    espIP,
    isConnectedToESP,
    espName,
    espStaIP,
    error,
    checkConnection: checkESP32Availability,
    sendWifiConfig,
    sendCloudConfig,
    setCustomEspIP,
  };
}
