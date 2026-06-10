/**
 * useCloudData — fetches the latest AGRIBOT sensor reading from the cloud.
 *
 * Supports two backends out of the box:
 *
 *  1. Supabase (recommended — free, zero server code)
 *     serverUrl : https://xxxx.supabase.co
 *     apiKey    : your project's "anon / public" key
 *     The hook auto-detects Supabase URLs and uses the PostgREST API.
 *
 *  2. Custom REST API (any backend)
 *     serverUrl : https://your-server.com
 *     GET  {serverUrl}/api/latest          → returns latest row as JSON object
 *     POST {serverUrl}/api/readings        → store a reading (used by ESP32)
 *
 * The hook returns the same shape as useESP32Sensors so every tab works
 * without changes when the mode is switched to Online.
 *
 * Supabase table schema (run once in the Supabase SQL editor):
 * ─────────────────────────────────────────────────────────────
 * CREATE TABLE sensor_readings (
 *   id              BIGSERIAL PRIMARY KEY,
 *   device_id       TEXT    DEFAULT 'AGRIBOT-ESP',
 *   created_at      TIMESTAMPTZ DEFAULT NOW(),
 *   temperature     FLOAT,
 *   humidity        FLOAT,
 *   soil_moisture   FLOAT,
 *   smoke_raw       INT,
 *   smoke_detected  BOOL    DEFAULT FALSE,
 *   flame_raw       INT,
 *   flame_detected  BOOL    DEFAULT FALSE,
 *   gps_valid       BOOL    DEFAULT FALSE,
 *   latitude        FLOAT,
 *   longitude       FLOAT,
 *   altitude        FLOAT,
 *   speed_kmph      FLOAT,
 *   satellites      INT     DEFAULT 0,
 *   uptime_ms       BIGINT
 * );
 * ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "public read"   ON sensor_readings FOR SELECT USING (true);
 * CREATE POLICY "public insert" ON sensor_readings FOR INSERT WITH CHECK (true);
 * ─────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SensorData } from './use-esp32-sensors';
import type { CloudConfig } from '@/context/AppModeContext';

// ── Row → SensorData mapper ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSensorData(row: Record<string, any>): SensorData {
  const gpsValid = row.gps_valid === true;
  return {
    temperatureC:    row.temperature    ?? undefined,
    humidityPct:     row.humidity       ?? undefined,
    soilMoisturePct: row.soil_moisture  ?? undefined,

    smoke: row.smoke_raw !== undefined && row.smoke_raw !== null ? {
      raw:      row.smoke_raw,
      detected: row.smoke_detected ?? false,
      status:   row.smoke_detected ? 'DETECTED' : 'Normal',
    } : undefined,

    flame: row.flame_raw !== undefined && row.flame_raw !== null ? {
      raw:      row.flame_raw,
      detected: row.flame_detected ?? false,
      status:   row.flame_detected ? 'DETECTED' : 'None',
    } : undefined,

    location: gpsValid ? {
      gps: {
        valid:      true,
        lat:        row.latitude,
        lng:        row.longitude,
        altitude:   row.altitude   ?? 0,
        speed_kmph: row.speed_kmph ?? 0,
        satellites: row.satellites ?? 0,
      },
    } : {
      gps: { valid: false, lat: 0, lng: 0, satellites: row.satellites ?? 0 },
    },

    // Legacy flat fields (consumed by some tabs)
    gps: gpsValid ? { lat: row.latitude, lng: row.longitude } : undefined,

    systemInfo: {
      uptimeSeconds: row.uptime_ms ? Math.floor(Number(row.uptime_ms) / 1000) : 0,
      i2cReady:   false,
      sht3xReady: row.temperature !== null && row.temperature !== undefined,
      oledReady:  false,
    },
  };
}

// ── Build the GET URL based on backend type ───────────────────────────────────

function buildReadUrl(cfg: CloudConfig): string {
  const base = cfg.serverUrl.replace(/\/$/, '');
  if (base.includes('supabase.co')) {
    const table = cfg.tableName ?? 'sensor_readings';
    return `${base}/rest/v1/${table}?order=created_at.desc&limit=1&select=*`;
  }
  return `${base}/api/latest`;
}

// ── Build request headers ─────────────────────────────────────────────────────

function buildHeaders(cfg: CloudConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) {
    h['apikey']        = cfg.apiKey;          // Supabase header
    h['Authorization'] = `Bearer ${cfg.apiKey}`;
  }
  return h;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface CloudDataResult {
  sensorData:  SensorData | null;
  loading:     boolean;
  error:       string | null;
  isConnected: boolean;
  lastSyncAt:  number | null;
  refetch:     () => void;
}

export function useCloudData(
  config:  CloudConfig | null,
  enabled: boolean,
): CloudDataResult {
  const [sensorData,  setSensorData]  = useState<SensorData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncAt,  setLastSyncAt]  = useState<number | null>(null);
  const lastErrMsg = useRef<string | null>(null);

  const fetchLatest = useCallback(async () => {
    if (!enabled || !config?.serverUrl) return;

    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 10_000);

      const res = await fetch(buildReadUrl(config), {
        headers: buildHeaders(config),
        signal:  ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) throw new Error(`HTTP ${res.status} from cloud`);

      const json = await res.json();
      // Supabase returns an array; custom API may return a plain object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = (Array.isArray(json) ? json[0] : json) as Record<string, any> | undefined;
      if (!row) throw new Error('Cloud returned no data yet');

      setSensorData(rowToSensorData(row));
      setIsConnected(true);
      setError(null);
      setLastSyncAt(Date.now());
      lastErrMsg.current = null;
    } catch (err) {
      setIsConnected(false);
      const msg = err instanceof Error ? err.message : 'Cloud fetch failed';
      setError(msg);
      if (msg !== lastErrMsg.current) {
        console.warn('[Cloud]', msg);
        lastErrMsg.current = msg;
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, config]);

  useEffect(() => {
    if (!enabled || !config?.serverUrl) {
      setSensorData(null);
      setIsConnected(false);
      setError(null);
      return;
    }
    setLoading(true);
    void fetchLatest();
    const id = setInterval(() => void fetchLatest(), 5_000);
    return () => clearInterval(id);
  }, [enabled, config?.serverUrl, fetchLatest]);

  return { sensorData, loading, error, isConnected, lastSyncAt, refetch: fetchLatest };
}
