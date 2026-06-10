import { useState, useEffect, useCallback, useRef } from 'react';
import { useESP32IP } from '@/context/ESP32Context';
import { useAppMode } from '@/context/AppModeContext';
import { useCloudData } from '@/hooks/use-cloud-data';

export interface SensorData {
  // Domino4 I2C Sensors (Real-time, xChips standard)
  domino4?: {
    weather?: {
      temperatureC: number;
      humidityPct: number;
      source: string;
    };
    light?: {
      luxLevel: number;
      uvIndex: number;
      source: string;
    };
    soil?: {
      moisturePct: number;
      rawTouch: number;
      source: string;
    };
    display?: {
      active: boolean;
      source: string;
    };
  };
  
  // Legacy ADC sensors
  adc?: {
    temperatureC: number;
    humidityPct: number;
    soilMoisturePct: number;
    ph: number;
    batteryPct: number;
  };
  
  // Air Quality (optional)
  airQuality?: {
    co2Ppm: number;
    tvocPpb: number;
  };
  
  // Location
  location?: {
    gps?: {
      lat: number;
      lng: number;
      valid?: boolean;
      satellites?: number;
      altitude?: number;
      speed_kmph?: number;
    };
  };

  // Smoke / Gas (MQ sensor)
  smoke?: {
    raw: number;
    detected: boolean;
    status: string;
  };

  // Flame sensor
  flame?: {
    raw: number;
    detected: boolean;
    status: string;
  };
  
  camera?: {
    streaming: boolean;
  };
  
  // System info
  systemInfo?: {
    i2cReady: boolean;
    sht3xReady: boolean;
    oledReady: boolean;
    uptimeSeconds: number;
  };
  
  // Legacy fields for backward compatibility
  temperatureC?: number;
  humidityPct?: number;
  soilMoisturePct?: number;
  batteryPct?: number;
  ph?: number;
  gps?: {
    lat: number;
    lng: number;
  };
  raw?: {
    temperatureAdc: number;
    humidityAdc: number;
    soilAdc: number;
    phAdc: number;
    batteryAdc: number;
  };
  voltage?: {
    temperatureV: number;
    humidityV: number;
    soilV: number;
    phV: number;
    batteryPinV: number;
    batteryPackV: number;
  };
}

export interface ESP32Health {
  status: string;
  name: string;
  ip: string;
  uptimeMs: number;
  service: string;
}

export interface UseESP32SensorsOptions {
  esp32Ip?: string;
  pollInterval?: number; // ms
  autoStart?: boolean;
}

export function useESP32Sensors(options: UseESP32SensorsOptions = {}) {
  // ── Mode: Online (cloud) or Offline (direct ESP32) ──────────────────────
  const { isOnline, cloudConfig } = useAppMode();

  // Cloud data hook — always called (React rules), but only active in online mode
  const cloud = useCloudData(cloudConfig, isOnline);

  // Fall back to the globally shared IP from ESP32Context when no explicit
  // esp32Ip is passed. This ensures every tab automatically polls the correct
  // address after the user switches from AP → router (STA) mode.
  const { espIP: contextIP, ready: contextReady } = useESP32IP();

  const esp32Ip      = options.esp32Ip      ?? contextIP;
  const pollInterval = options.pollInterval  ?? 2000;
  const autoStart    = options.autoStart     ?? true;

  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [health, setHealth]         = useState<ESP32Health | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const hasLoadedOnce    = useRef(false);
  // Suppress duplicate log lines — only print a warning when the error TYPE changes
  const lastLoggedError  = useRef<string | null>(null);

  /** True when an AbortController timeout fires — means ESP32 simply not reachable. */
  function isAbortError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return (
      err.name === 'AbortError' ||
      err.message === 'Aborted' ||
      err.message === 'The operation was aborted.' ||
      err.message === 'The user aborted a request.'
    );
  }

  const fetchSensorData = useCallback(async () => {
    try {
      // Only show loading spinner on the very first fetch
      if (!hasLoadedOnce.current) setLoading(true);

      const controller = new AbortController();
      // 5 s — generous enough for router-hop latency, tight enough to avoid pileups
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`http://${esp32Ip}/sensors`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as SensorData;
        setSensorData(data);
        setIsConnected(true);
        setError(null);
        hasLoadedOnce.current = true;
        lastLoggedError.current = null; // reset so a future error gets logged
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      setIsConnected(false);

      if (isAbortError(err)) {
        // Timeout = ESP32 not reachable right now — totally normal when no AP/STA
        // Do NOT console.error — it would flood the log at every poll interval.
        // The "Not connected" banner in the UI is enough feedback.
        return;
      }

      // Real (non-timeout) error — log once per unique message
      const msg = err instanceof Error ? err.message : 'Failed to fetch sensor data';
      setError(msg);
      if (msg !== lastLoggedError.current) {
        console.warn('[ESP32] sensor fetch failed:', msg);
        lastLoggedError.current = msg;
      }
    } finally {
      setLoading(false);
    }
  }, [esp32Ip]);

  const fetchHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`http://${esp32Ip}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as ESP32Health;
        setHealth(data);
        setIsConnected(true);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      setIsConnected(false);
      // Abort = unreachable, not an error worth logging
      if (!isAbortError(err)) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch health';
        console.warn('[ESP32] health fetch failed:', msg);
      }
    }
  }, [esp32Ip]);

  const checkESP32Connection = useCallback(async () => {
    try {
      await fetchHealth();
    } catch {
      setIsConnected(false);
    }
  }, [fetchHealth]);

  useEffect(() => {
    // Wait until the persisted IP has been loaded from SecureStore before
    // starting polls — avoids one wasted cycle against the wrong IP.
    if (!autoStart || !contextReady) return;

    fetchSensorData();
    checkESP32Connection();

    const id = setInterval(() => fetchSensorData(), pollInterval);
    return () => clearInterval(id);
  }, [autoStart, contextReady, fetchSensorData, checkESP32Connection, pollInterval]);

  // ── Return cloud data when in online mode, direct ESP32 data otherwise ──
  if (isOnline) {
    return {
      sensorData:      cloud.sensorData,
      health:          null,
      loading:         cloud.loading,
      error:           cloud.error,
      isConnected:     cloud.isConnected,
      refetch:         cloud.refetch,
      checkConnection: cloud.refetch,
      isOnlineMode:    true,
      lastSyncAt:      cloud.lastSyncAt,
    };
  }

  return {
    sensorData,
    health,
    loading,
    error,
    isConnected,
    refetch: fetchSensorData,
    checkConnection: checkESP32Connection,
    isOnlineMode:    false,
    lastSyncAt:      null,
  };
}
