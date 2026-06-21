import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const WEB_DEFAULT_CLOUD = {
  serverUrl: 'https://nthjehbwyuxwtwvcodeg.supabase.co',
  apiKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50aGplaGJ3eXV4d3R3dmNvZGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njk0MzMsImV4cCI6MjA5NTE0NTQzM30.' +
    'MVwfF17ZPfjCRps9gJXacwy8SgvJNRZYPQCNkKccwLk',
};

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try { localStorage.setItem(key, value); } catch {}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try { localStorage.removeItem(key); } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppMode = 'offline' | 'online';

export interface CloudConfig {
  serverUrl:  string;
  apiKey:     string;
  tableName?: string;
}

export interface MqttConfig {
  /** Broker hostname, e.g. "broker.hivemq.com" */
  host:        string;
  /** Username — empty string for public brokers */
  username:    string;
  /** Password — empty string for public brokers */
  password:    string;
  /** Topic prefix — commands go to "{prefix}/motors/cmd" */
  topicPrefix: string;
  /** true → wss:8884 (app) / tcp:8883 (ESP32), false → ws:8000 / tcp:1883 */
  useTls:      boolean;
}

export const DEFAULT_MQTT_CONFIG: MqttConfig = {
  host:        'broker.hivemq.com',
  username:    '',
  password:    '',
  topicPrefix: 'agribot',
  useTls:      true,
};

export interface AppModeContextValue {
  mode:            AppMode;
  setMode:         (mode: AppMode) => void;
  cloudConfig:     CloudConfig | null;
  setCloudConfig:  (cfg: CloudConfig) => void;
  clearCloud:      () => void;
  mqttConfig:      MqttConfig | null;
  setMqttConfig:   (cfg: MqttConfig) => void;
  clearMqtt:       () => void;
  /** AGRI-PC host (IP or hostname) for offline edge endpoints — manual override of mDNS discovery */
  edgeHost:        string | null;
  setEdgeHost:     (host: string | null) => void;
  /** true when mode === 'online' AND serverUrl is set */
  isOnline:        boolean;
  /** true when mode === 'online', regardless of cloud config — use for MQTT/motor-command routing */
  isOnlineMode:    boolean;
  /** false until initial values are loaded from SecureStore */
  ready:           boolean;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const KEY_MODE  = 'agribot_app_mode';
const KEY_CLOUD = 'agribot_cloud_config';
const KEY_MQTT  = 'agribot_mqtt_config';
const KEY_EDGE  = 'agribot_edge_host';

// ── Context ───────────────────────────────────────────────────────────────────

const AppModeContext = createContext<AppModeContextValue>({
  mode:           'offline',
  setMode:        () => {},
  cloudConfig:    null,
  setCloudConfig: () => {},
  clearCloud:     () => {},
  mqttConfig:     null,
  setMqttConfig:  () => {},
  clearMqtt:      () => {},
  edgeHost:       null,
  setEdgeHost:    () => {},
  isOnline:       false,
  isOnlineMode:   false,
  ready:          false,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode,  setModeState]  = useState<AppMode>('offline');
  const [cloud, setCloudState] = useState<CloudConfig | null>(null);
  const [mqtt,  setMqttState]  = useState<MqttConfig | null>(null);
  const [edge,  setEdgeState]  = useState<string | null>(null);
  const [ready, setReady]      = useState(false);

  useEffect(() => {
    Promise.all([
      storage.getItem(KEY_MODE),
      storage.getItem(KEY_CLOUD),
      storage.getItem(KEY_MQTT),
      storage.getItem(KEY_EDGE),
    ]).then(([savedMode, savedCloud, savedMqtt, savedEdge]) => {
      if (savedCloud) {
        try { setCloudState(JSON.parse(savedCloud) as CloudConfig); } catch {}
      }
      if (savedMqtt) {
        try { setMqttState(JSON.parse(savedMqtt) as MqttConfig); } catch {}
      }
      if (savedEdge) setEdgeState(savedEdge);

      if (Platform.OS === 'web') {
        if (!savedCloud) setCloudState(WEB_DEFAULT_CLOUD);
        setModeState('online');
      } else if (savedMode === 'online' || savedMode === 'offline') {
        setModeState(savedMode as AppMode);
      }
      setReady(true);
    });
  }, []);

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    storage.setItem(KEY_MODE, m).catch(() => {});
  }, []);

  const setCloudConfig = useCallback((cfg: CloudConfig) => {
    setCloudState(cfg);
    storage.setItem(KEY_CLOUD, JSON.stringify(cfg)).catch(() => {});
  }, []);

  const clearCloud = useCallback(() => {
    setCloudState(null);
    setModeState('offline');
    storage.removeItem(KEY_CLOUD).catch(() => {});
    storage.setItem(KEY_MODE, 'offline').catch(() => {});
  }, []);

  const setMqttConfig = useCallback((cfg: MqttConfig) => {
    setMqttState(cfg);
    storage.setItem(KEY_MQTT, JSON.stringify(cfg)).catch(() => {});
  }, []);

  const clearMqtt = useCallback(() => {
    setMqttState(null);
    storage.removeItem(KEY_MQTT).catch(() => {});
  }, []);

  const setEdgeHost = useCallback((host: string | null) => {
    setEdgeState(host);
    if (host) storage.setItem(KEY_EDGE, host).catch(() => {});
    else storage.removeItem(KEY_EDGE).catch(() => {});
  }, []);

  const isOnline = Platform.OS === 'web'
    ? !!cloud?.serverUrl
    : mode === 'online' && !!cloud?.serverUrl;

  const isOnlineMode = Platform.OS === 'web' ? true : mode === 'online';

  return (
    <AppModeContext.Provider
      value={{
        mode, setMode,
        cloudConfig: cloud, setCloudConfig, clearCloud,
        mqttConfig: mqtt, setMqttConfig, clearMqtt,
        edgeHost: edge, setEdgeHost,
        isOnline, isOnlineMode, ready,
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAppMode(): AppModeContextValue {
  return useContext(AppModeContext);
}
