/**
 * ESP32Context — global shared ESP32 IP address.
 *
 * When the ESP32 connects to a router (STA mode), its AP IP (192.168.4.1)
 * is unreachable from the router network. This context keeps ONE active IP
 * that every screen uses to poll sensors. When the Network tab detects the
 * STA IP from /health, it calls setEspIP() and every hook immediately picks
 * up the new address without a restart.
 *
 * Persistence: stored in expo-secure-store so the last-used IP is restored
 * on next app launch (saves having to re-enter it after a reboot).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';

// ── Constants ────────────────────────────────────────────────────────────────

export const AP_IP    = '192.168.4.1';  // ESP32 access-point IP (always-on)
const STORE_KEY       = 'agribot_esp_active_ip';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadPersistedIP(): Promise<string> {
  try {
    const ip = await SecureStore.getItemAsync(STORE_KEY);
    return ip?.trim() || AP_IP;
  } catch {
    return AP_IP;
  }
}

async function persistIP(ip: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, ip.trim());
  } catch {
    // non-fatal — in-memory state still works
  }
}

// ── Context types ────────────────────────────────────────────────────────────

export interface ESP32ContextValue {
  /** The IP address every hook should poll (may be AP or STA). */
  espIP: string;

  /**
   * Update the global ESP IP. Persisted across restarts.
   * Call this when the user manually overrides the IP on the Network tab,
   * or when the STA IP is confirmed reachable.
   */
  setEspIP: (ip: string) => void;

  /** Revert to the default AP IP (192.168.4.1). */
  resetToAP: () => void;

  /**
   * True while the initial persisted value is still being loaded.
   * Components can show a brief skeleton if desired.
   */
  ready: boolean;
}

// ── Context ──────────────────────────────────────────────────────────────────

const ESP32Context = createContext<ESP32ContextValue>({
  espIP:      AP_IP,
  setEspIP:   () => {},
  resetToAP:  () => {},
  ready:      false,
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function ESP32Provider({ children }: { children: React.ReactNode }) {
  const [espIP, setEspIPState] = useState<string>(AP_IP);
  const [ready,  setReady]     = useState(false);

  // Restore persisted IP on mount
  useEffect(() => {
    loadPersistedIP().then(ip => {
      setEspIPState(ip);
      setReady(true);
    });
  }, []);

  const setEspIP = useCallback((ip: string) => {
    const clean = ip.trim();
    if (!clean) return;
    setEspIPState(clean);
    void persistIP(clean);
  }, []);

  const resetToAP = useCallback(() => {
    setEspIPState(AP_IP);
    void persistIP(AP_IP);
  }, []);

  return (
    <ESP32Context.Provider value={{ espIP, setEspIP, resetToAP, ready }}>
      {children}
    </ESP32Context.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useESP32IP(): ESP32ContextValue {
  return useContext(ESP32Context);
}
