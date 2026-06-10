/**
 * useCloudHistory — fetches time-ranged sensor_readings from Supabase.
 * • Display: paginated up to 5 000 rows (for chart + stats)
 * • Export : fetchAllForExport() — no row cap, paginates everything
 */

import { useCallback, useEffect, useState } from 'react';
import type { CloudConfig } from '@/context/AppModeContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimeRange = '1H' | '24H' | '7D' | '30D' | '1Y';
export type MetricKey = 'temperature' | 'humidity' | 'soil_moisture' | 'smoke_raw';

export interface HistoryRow {
  id:             number;
  created_at:     string;
  device_id:      string  | null;
  temperature:    number  | null;
  humidity:       number  | null;
  soil_moisture:  number  | null;
  smoke_raw:      number  | null;
  smoke_detected: boolean | null;
  flame_raw:      number  | null;
  flame_detected: boolean | null;
  gps_valid:      boolean | null;
  latitude:       number  | null;
  longitude:      number  | null;
  altitude:       number  | null;
  speed_kmph:     number  | null;
  satellites:     number  | null;
  uptime_ms:      number  | null;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function getStartTime(range: TimeRange): Date {
  const now = new Date();
  const ms: Record<TimeRange, number> = {
    '1H':  1      * 60 * 60 * 1_000,
    '24H': 24     * 60 * 60 * 1_000,
    '7D':  7  * 24 * 60 * 60 * 1_000,
    '30D': 30 * 24 * 60 * 60 * 1_000,
    '1Y':  365* 24 * 60 * 60 * 1_000,
  };
  return new Date(now.getTime() - ms[range]);
}

/** How many rows to keep in memory for chart/stats (max 5 pages of 1 000). */
function getDisplayCap(range: TimeRange): number {
  const caps: Record<TimeRange, number> = {
    '1H':  1_000,   // ~40 rows/hr – one page is always enough
    '24H': 2_000,   // ~1 000 rows/day – 2 pages
    '7D':  5_000,   // ~7 000 rows/week – 5 pages
    '30D': 5_000,   // sample from ~30 000
    '1Y':  5_000,   // sample from ~365 000
  };
  return caps[range];
}

/** Supabase PostgREST page size (max rows per request). */
const PAGE = 1_000;

/**
 * Core paginated fetch.
 * @param maxRows  0 = unlimited (fetch every row). Any positive number caps total.
 * @param onProgress  called after each page with the running total fetched.
 */
async function paginatedFetch(
  base:        string,
  table:       string,
  headers:     Record<string, string>,
  startTime:   string,
  maxRows:     number,
  onProgress?: (fetched: number) => void,
): Promise<HistoryRow[]> {
  const all: HistoryRow[] = [];
  let offset = 0;

  while (true) {
    const batchSize = maxRows > 0
      ? Math.min(PAGE, maxRows - all.length)
      : PAGE;

    if (batchSize <= 0) break;

    const url =
      `${base}/rest/v1/${table}` +
      `?created_at=gte.${encodeURIComponent(startTime)}` +
      `&order=created_at.asc` +
      `&limit=${batchSize}` +
      `&offset=${offset}` +
      `&select=*`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const page = (await res.json()) as HistoryRow[];
    all.push(...page);
    onProgress?.(all.length);

    // Received fewer rows than PAGE → this was the last page
    if (page.length < PAGE) break;

    offset += page.length;
  }

  return all;
}

// ── Hook (display) ────────────────────────────────────────────────────────────

export function useCloudHistory(
  cloudConfig: CloudConfig | null,
  range:       TimeRange,
  enabled:     boolean,
) {
  const [rows,    setRows]    = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !cloudConfig?.serverUrl || !cloudConfig?.apiKey) return;

    setLoading(true);
    setError(null);

    try {
      const base      = cloudConfig.serverUrl.replace(/\/$/, '');
      const table     = cloudConfig.tableName ?? 'sensor_readings';
      const startTime = getStartTime(range).toISOString();
      const headers   = {
        apikey:          cloudConfig.apiKey,
        Authorization:  `Bearer ${cloudConfig.apiKey}`,
        'Content-Type': 'application/json',
      };

      const data = await paginatedFetch(
        base, table, headers, startTime,
        getDisplayCap(range),  // capped — for fast chart + stats
      );
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, [cloudConfig, range, enabled]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { rows, loading, error, refetch };
}

// ── Full export (no row cap — fetches ALL data) ───────────────────────────────

/**
 * Fetches every row in the given time range with no cap.
 * Use this for CSV export only — not for the chart.
 * @param onProgress  called after each 1 000-row page with total fetched so far.
 */
export async function fetchAllForExport(
  cloudConfig: CloudConfig,
  range:       TimeRange,
  onProgress?: (fetched: number) => void,
): Promise<HistoryRow[]> {
  const base      = cloudConfig.serverUrl.replace(/\/$/, '');
  const table     = cloudConfig.tableName ?? 'sensor_readings';
  const startTime = getStartTime(range).toISOString();
  const headers   = {
    apikey:          cloudConfig.apiKey,
    Authorization:  `Bearer ${cloudConfig.apiKey}`,
    'Content-Type': 'application/json',
  };

  return paginatedFetch(base, table, headers, startTime, 0, onProgress);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function computeStats(rows: HistoryRow[], field: MetricKey) {
  const values = rows
    .map(r => r[field] as number | null)
    .filter((v): v is number => v !== null && !isNaN(Number(v)));

  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    min:   Math.round(min * 10) / 10,
    max:   Math.round(max * 10) / 10,
    avg:   Math.round(avg * 10) / 10,
    count: values.length,
  };
}

// ── CSV builder ───────────────────────────────────────────────────────────────

export function rowsToCSV(rows: HistoryRow[]): string {
  const header = [
    'timestamp', 'device_id',
    'temperature_C', 'humidity_pct', 'soil_moisture_pct',
    'smoke_raw', 'smoke_detected', 'flame_raw', 'flame_detected',
    'gps_valid', 'latitude', 'longitude', 'altitude', 'speed_kmph', 'satellites',
    'uptime_ms',
  ].join(',');

  const lines = rows.map(r =>
    [
      r.created_at,
      r.device_id      ?? 'AGRIBOT-ESP',
      r.temperature    ?? '',
      r.humidity       ?? '',
      r.soil_moisture  ?? '',
      r.smoke_raw      ?? '',
      r.smoke_detected ?? '',
      r.flame_raw      ?? '',
      r.flame_detected ?? '',
      r.gps_valid      ?? '',
      r.latitude       ?? '',
      r.longitude      ?? '',
      r.altitude       ?? '',
      r.speed_kmph     ?? '',
      r.satellites     ?? '',
      r.uptime_ms      ?? '',
    ].join(','),
  );

  return [header, ...lines].join('\n');
}
