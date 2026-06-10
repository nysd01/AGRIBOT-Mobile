/**
 * useAlertMonitor
 * ───────────────
 * Global background watcher for FLAME and SMOKE alerts.
 *
 * What it does:
 *  1. Polls ESP32 (or cloud) sensor data every 2 s.
 *  2. On rising edge (not-detected → detected):
 *       a. Fires an immediate OS push notification (works while app is backgrounded).
 *       b. Calls the Supabase Edge Function `alert-email` to send a
 *          professional HTML email to the logged-in user's email address.
 *  3. Anti-spam: 5-minute cooldown per alert type.
 *     Rising-edge detection prevents repeat triggers while the sensor stays active.
 *
 * Usage — mount once in app/(tabs)/_layout.tsx:
 *   useAlertMonitor(user?.email, cloudConfig);
 */

import { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useESP32Sensors } from '@/hooks/use-esp32-sensors';
import type { CloudConfig } from '@/context/AppModeContext';

// ── Notification display behaviour ────────────────────────────────────────────
// This must be called at module level (not inside a component/hook).
// Guard: expo-notifications local scheduling still works in Expo Go SDK 53;
// only remote/FCM push tokens were removed. The setNotificationHandler call
// is safe here — the module-level DevicePushTokenAutoRegistration warning
// is harmless and does not affect local alert delivery.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert:  true,
      shouldPlaySound:  true,
      shouldSetBadge:   true,
      shouldShowBanner: true,
      shouldShowList:   true,
    }),
  });
} catch {
  // Expo Go SDK 53 — local notifications still work; ignore any setup error.
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum gap between two emails for the same alert type. */
const COOLDOWN_MS = 5 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertType = 'FLAME' | 'SMOKE';

interface AlertPayload {
  type:       AlertType;
  userEmail:  string;
  temp:       number;
  humidity:   number;
  moisture:   number;
  smokeRaw:   number;
  timestamp:  string;
  lat?:       number;
  lng?:       number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('agribot-alerts', {
    name:              'AGRIBOT Field Alerts',
    description:       'Critical flame and smoke alerts from the AGRIBOT robot.',
    importance:        Notifications.AndroidImportance.MAX,
    vibrationPattern:  [0, 300, 200, 300, 200, 600],
    lightColor:        '#FF4444',
    sound:             'default',
    enableVibrate:     true,
    showBadge:         true,
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAlertMonitor(
  userEmail:   string | undefined | null,
  cloudConfig: CloudConfig | null,
) {
  const { sensorData } = useESP32Sensors({ pollInterval: 2000 });

  // Track previous sensor state (rising-edge detection)
  const prevFlame = useRef(false);
  const prevSmoke = useRef(false);

  // Cooldown refs — stores the timestamp of the last sent alert
  const lastFlameMs = useRef(0);
  const lastSmokeMs = useRef(0);

  // ── Setup permissions & Android channel on mount ──────────────────────────
  useEffect(() => {
    const setup = async () => {
      try {
        await setupNotificationChannel();
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[AlertMonitor] Notification permission not granted.');
        }
      } catch {
        // Expo Go SDK 53 may reject permission requests for remote notifications;
        // local scheduleNotificationAsync still works — continue silently.
        console.warn('[AlertMonitor] Notification setup limited (Expo Go mode).');
      }
    };
    void setup();
  }, []);

  // ── Send OS push notification ─────────────────────────────────────────────
  const pushNotification = useCallback(async (
    type:    AlertType,
    temp:    number,
    moisture: number,
    smokeRaw: number,
  ) => {
    const isFlame = type === 'FLAME';
    const time    = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: isFlame
            ? '🔥 AGRIBOT — FIRE ALERT: Immediate Action Required'
            : '⚠️ AGRIBOT — SMOKE ALERT: Field Hazard Detected',
          body: isFlame
            ? `Flame sensor triggered at ${time}. Temp: ${temp.toFixed(1)}°C. DO NOT enter the field — check the AGRIBOT app for emergency protocol.`
            : `Smoke/gas detected at ${time} (raw: ${smokeRaw}). Soil: ${moisture.toFixed(0)}%. Inspect the field before sending robot in.`,
          sound:    'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          data:     { alertType: type, timestamp: new Date().toISOString() },
          ...(Platform.OS === 'android' && { channelId: 'agribot-alerts' }),
        },
        trigger: null, // show immediately (local notification)
      });
    } catch {
      console.warn('[AlertMonitor] Local notification failed — email still sent.');
    }
  }, []);

  // ── Send email via Supabase Edge Function ─────────────────────────────────
  const sendEmail = useCallback(async (payload: AlertPayload) => {
    if (!cloudConfig?.serverUrl || !cloudConfig?.apiKey) {
      console.warn('[AlertMonitor] No cloud config — email skipped.');
      return;
    }
    if (!payload.userEmail) {
      console.warn('[AlertMonitor] No user email — email skipped.');
      return;
    }

    const base = cloudConfig.serverUrl.replace(/\/$/, '');
    const url  = `${base}/functions/v1/alert-email`;

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${cloudConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn('[AlertMonitor] Edge function returned', res.status);
      } else {
        console.log('[AlertMonitor] Alert email sent to', payload.userEmail);
      }
    } catch (e) {
      // Network error or edge function not deployed — fail silently.
      // Push notification already went out.
      console.warn('[AlertMonitor] Email delivery failed (edge function unreachable):', e);
    }
  }, [cloudConfig]);

  // ── Main sensor watcher ───────────────────────────────────────────────────
  useEffect(() => {
    if (!sensorData) return;

    const flameOn  = sensorData?.flame?.detected ?? false;
    const smokeOn  = sensorData?.smoke?.detected ?? false;
    const temp     = sensorData?.domino4?.weather?.temperatureC ?? sensorData?.temperatureC    ?? 0;
    const humidity = sensorData?.domino4?.weather?.humidityPct  ?? sensorData?.humidityPct     ?? 0;
    const moisture = sensorData?.domino4?.soil?.moisturePct     ?? sensorData?.soilMoisturePct ?? 0;
    const smokeRaw = sensorData?.smoke?.raw ?? 0;
    const lat      = sensorData?.location?.gps?.lat;
    const lng      = sensorData?.location?.gps?.lng;
    const now      = Date.now();

    // ── FLAME: rising edge + cooldown ───────────────────────────────────────
    if (flameOn && !prevFlame.current) {
      if (now - lastFlameMs.current > COOLDOWN_MS) {
        lastFlameMs.current = now;

        void pushNotification('FLAME', temp, moisture, smokeRaw);

        if (userEmail) {
          void sendEmail({
            type: 'FLAME', userEmail, temp, humidity, moisture, smokeRaw,
            timestamp: new Date().toISOString(), lat, lng,
          });
        }
      }
    }
    prevFlame.current = flameOn;

    // ── SMOKE: rising edge + cooldown ───────────────────────────────────────
    if (smokeOn && !prevSmoke.current) {
      if (now - lastSmokeMs.current > COOLDOWN_MS) {
        lastSmokeMs.current = now;

        void pushNotification('SMOKE', temp, moisture, smokeRaw);

        if (userEmail) {
          void sendEmail({
            type: 'SMOKE', userEmail, temp, humidity, moisture, smokeRaw,
            timestamp: new Date().toISOString(), lat, lng,
          });
        }
      }
    }
    prevSmoke.current = smokeOn;

  }, [sensorData, userEmail, pushNotification, sendEmail]);
}
