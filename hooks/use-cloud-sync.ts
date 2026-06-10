/**
 * useCloudSync — buffers ESP32 sensor snapshots locally and (optionally)
 * pushes them to a cloud endpoint.
 *
 * Current phase: LOCAL ONLY  — all data stays on the device.
 * Future phase:  set cloudUrl to your backend and call syncNow() to push.
 *                Even when the phone is far from the ESP32, the app can
 *                fetch historical readings from the cloud.
 *
 * Usage:
 *   const { record, snapshots, syncNow, lastSyncAt, pendingCount } = useCloudSync();
 *
 *   // Call record() each time you receive new sensor data:
 *   useEffect(() => { if (sensorData) record(sensorData); }, [sensorData]);
 */

import { useCallback, useRef, useState } from 'react';
import type { SensorData } from './use-esp32-sensors';

export interface SensorSnapshot {
  ts: number;          // Unix ms
  espIP: string;       // which ESP32 IP produced this reading
  data: SensorData;
}

const MAX_LOCAL   = 500;   // max snapshots kept in memory
const MIN_INTERVAL_MS = 5000; // minimum gap between records (5 s)

export interface UseCloudSyncOptions {
  /** Optional backend URL — POST /snapshots with JSON body { snapshots: SensorSnapshot[] } */
  cloudUrl?: string;
  /** Max items to send per sync batch (default 50) */
  batchSize?: number;
}

export function useCloudSync(options: UseCloudSyncOptions = {}) {
  const { cloudUrl, batchSize = 50 } = options;

  const [snapshots,   setSnapshots]   = useState<SensorSnapshot[]>([]);
  const [lastSyncAt,  setLastSyncAt]  = useState<number | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [syncError,   setSyncError]   = useState<string | null>(null);

  const lastRecordTs = useRef<number>(0);

  /** Add a sensor snapshot to the local buffer (rate-limited to MIN_INTERVAL_MS). */
  const record = useCallback((data: SensorData, espIP = '192.168.4.1') => {
    const now = Date.now();
    if (now - lastRecordTs.current < MIN_INTERVAL_MS) return;
    lastRecordTs.current = now;

    const snap: SensorSnapshot = { ts: now, espIP, data };
    setSnapshots(prev => [...prev.slice(-(MAX_LOCAL - 1)), snap]);
  }, []);

  /** Push buffered snapshots to the cloud endpoint (if configured). */
  const syncNow = useCallback(async (): Promise<void> => {
    if (!cloudUrl) {
      setSyncError('No cloud URL configured. Set cloudUrl in useCloudSync options.');
      return;
    }
    if (snapshots.length === 0) return;

    setSyncing(true);
    setSyncError(null);

    const batch = snapshots.slice(-batchSize);
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 10000);
      const res  = await fetch(`${cloudUrl}/snapshots`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ snapshots: batch }),
        signal:  ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // On success, trim the synced items from the buffer
      setSnapshots(prev => prev.slice(0, prev.length - batch.length));
      setLastSyncAt(Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setSyncError(msg);
      console.warn('[CloudSync]', msg);
    } finally {
      setSyncing(false);
    }
  }, [cloudUrl, snapshots, batchSize]);

  return {
    /** Call this with every new sensorData reading to buffer it. */
    record,
    /** Locally buffered snapshots (most recent last). */
    snapshots,
    /** Number of snapshots not yet synced. */
    pendingCount: snapshots.length,
    /** Push to cloud. No-op when cloudUrl is not set. */
    syncNow,
    /** Timestamp of last successful sync (null if never). */
    lastSyncAt,
    syncing,
    syncError,
  };
}
