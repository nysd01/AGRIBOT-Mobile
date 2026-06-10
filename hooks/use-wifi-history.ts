/**
 * useWifiHistory — persists saved router credentials in SecureStore.
 *
 * Passwords are encrypted at rest by the OS keychain (expo-secure-store).
 * Networks are sorted by most-recently-used so the last one used appears first.
 */
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'agribot_wifi_history';

export interface SavedNetwork {
  id: string;          // unique — Date.now() string
  ssid: string;
  password: string;
  lastUsed: number;    // Unix ms — for sorting
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

async function persist(nets: SavedNetwork[]) {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(nets));
}

function sortByRecent(nets: SavedNetwork[]): SavedNetwork[] {
  return [...nets].sort((a, b) => b.lastUsed - a.lastUsed);
}

export function useWifiHistory() {
  const [networks, setNetworks] = useState<SavedNetwork[]>([]);
  const [loading, setLoading]   = useState(true);

  // Load from SecureStore on mount
  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then(raw => {
        if (raw) setNetworks(sortByRecent(JSON.parse(raw) as SavedNetwork[]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /**
   * Add a new network or update an existing one (matched by SSID).
   * Also bumps its lastUsed timestamp so it floats to the top.
   */
  const saveNetwork = useCallback((ssid: string, password: string) => {
    setNetworks(prev => {
      const existing = prev.find(n => n.ssid === ssid);
      let next: SavedNetwork[];
      if (existing) {
        next = prev.map(n =>
          n.ssid === ssid ? { ...n, password, lastUsed: Date.now() } : n
        );
      } else {
        next = [
          ...prev,
          { id: Date.now().toString(), ssid, password, lastUsed: Date.now() },
        ];
      }
      const sorted = sortByRecent(next);
      void persist(sorted);
      return sorted;
    });
  }, []);

  /** Bump lastUsed without changing the password */
  const markUsed = useCallback((ssid: string) => {
    setNetworks(prev => {
      const next = sortByRecent(
        prev.map(n => n.ssid === ssid ? { ...n, lastUsed: Date.now() } : n)
      );
      void persist(next);
      return next;
    });
  }, []);

  /** Remove a network by its id */
  const removeNetwork = useCallback((id: string) => {
    setNetworks(prev => {
      const next = prev.filter(n => n.id !== id);
      void persist(next);
      return next;
    });
  }, []);

  return { networks, loading, saveNetwork, markUsed, removeNetwork, relativeTime };
}
