/**
 * useMqtt — connects to an MQTT broker via WebSocket and exposes a stable
 * publishCmd() function for sending motor/camera commands.
 *
 * Online mode only: hook is a no-op when mode !== 'online' or mqttConfig is null.
 * Connection does NOT require a Supabase cloud config — MQTT is independent
 * of the cloud sensor-data path.
 *
 * Architecture:
 *   Phone ──[MQTT WSS]──► HiveMQ Cloud ──[MQTT TCP]──► ESP32-Motors
 *   Latency: ~40-80 ms end-to-end.
 *
 * Stable publishCmd: the returned function is created once (empty deps) and
 * reads live state via refs, making it safe to store in a pan-responder ref.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppMode } from '@/context/AppModeContext';

// Buffer polyfill — mqtt package needs it in React Native
if (typeof (global as any).Buffer === 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (global as any).Buffer = require('buffer').Buffer;
  } catch { /* ignore — some bundlers include it automatically */ }
}

// mqtt's lib/connect/ws.js picks its WebSocket transport based on
// `process.title === 'browser'`. Without this, it falls through to the
// Node.js path, which requires the `ws` package — whose browser stub just
// throws "ws does not work in the browser", silently breaking the connection.
// Setting process.title here makes mqtt use the native global WebSocket,
// which React Native provides.
if (typeof (global as any).process === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (global as any).process = require('process/browser');
} else if (typeof (global as any).process.nextTick !== 'function') {
  // RN's built-in `process` global lacks `nextTick`. mqtt's dependency chain
  // (duplexify -> end-of-stream) calls `process.nextTick.bind(process)` at
  // module-load time, which throws "Cannot read property 'bind' of undefined"
  // without this.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (global as any).process.nextTick = require('process/browser').nextTick;
}
if ((global as any).process.title !== 'browser') {
  (global as any).process.title = 'browser';
}

export function useMqtt() {
  const { isOnlineMode, mqttConfig } = useAppMode();

  const clientRef    = useRef<any>(null);
  const connectedRef = useRef(false);
  const configRef    = useRef(mqttConfig);

  const [mqttConnected, setMqttConnected] = useState(false);

  // Keep configRef in sync
  useEffect(() => { configRef.current = mqttConfig; }, [mqttConfig]);

  useEffect(() => {
    if (!isOnlineMode || !mqttConfig) {
      try { clientRef.current?.end(true); } catch { /* ignore */ }
      clientRef.current  = null;
      connectedRef.current = false;
      setMqttConnected(false);
      return;
    }

    const { host, useTls, username, password } = mqttConfig;
    const wsPort   = useTls ? 8884 : 8000;
    const protocol = useTls ? 'wss' : 'ws';
    const brokerUrl = `${protocol}://${host}:${wsPort}/mqtt`;

    const opts: Record<string, unknown> = {
      clientId:        `agribot_app_${Math.random().toString(16).slice(2, 10)}`,
      clean:           true,
      reconnectPeriod: 5000,
      connectTimeout:  10000,
    };
    if (username) opts.username = username;
    if (password) opts.password = password;

    let mounted = true;

    // Dynamic import avoids bundler issues on platforms that don't support mqtt
    import('mqtt').then((mod) => {
      if (!mounted) return;
      const mqttLib = (mod as any).default ?? mod;
      try {
        const client = mqttLib.connect(brokerUrl, opts);
        clientRef.current = client;

        client.on('connect', () => {
          if (!mounted) return;
          connectedRef.current = true;
          setMqttConnected(true);
        });
        client.on('error', (err: Error) => {
          console.warn('[MQTT]', err?.message ?? err);
          if (!mounted) return;
          connectedRef.current = false;
          setMqttConnected(false);
        });
        client.on('close', () => {
          if (!mounted) return;
          connectedRef.current = false;
          setMqttConnected(false);
        });
        client.on('offline', () => {
          if (!mounted) return;
          connectedRef.current = false;
          setMqttConnected(false);
        });
      } catch (err) {
        console.warn('[MQTT] connect error:', err);
      }
    }).catch((err) => {
      console.warn('[MQTT] import error:', err);
    });

    return () => {
      mounted = false;
      try { clientRef.current?.end(true); } catch { /* ignore */ }
      clientRef.current  = null;
      connectedRef.current = false;
      setMqttConnected(false);
    };
  // Reconnect only when connection params change, not on every config object ref change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnlineMode, mqttConfig?.host, mqttConfig?.useTls, mqttConfig?.username, mqttConfig?.password]);

  // Stable publish — reads via refs so pan-responder closures don't go stale
  const publishCmd = useCallback((cmd: string): boolean => {
    if (!clientRef.current || !connectedRef.current || !configRef.current) return false;
    const topic = `${configRef.current.topicPrefix}/motors/cmd`;
    try {
      clientRef.current.publish(topic, cmd, { qos: 0, retain: false });
      return true;
    } catch {
      return false;
    }
  // stable — intentionally no deps (reads via refs at call time)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mqttConnected, publishCmd };
}
