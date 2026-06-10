/**
 * lib/supabase.ts
 * ───────────────
 * Singleton Supabase client for AGRIBOT.
 *
 * Used for:
 *  - Cloud authentication (sign-up / sign-in / session restore)
 *  - Cloud data queries (sensor_readings table) in Online mode
 *  - Alert email edge-function calls
 *
 * The anon key is intentionally public — it is safe to embed in
 * client-side mobile code. Row-Level Security on the Supabase project
 * controls data access.
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ── Project constants ─────────────────────────────────────────────────────────

export const SUPABASE_URL     = 'https://nthjehbwyuxwtwvcodeg.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50aGplaGJ3eXV4d3R3dmNvZGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njk0MzMsImV4cCI6MjA5NTE0NTQzM30.' +
  'MVwfF17ZPfjCRps9gJXacwy8SgvJNRZYPQCNkKccwLk';

// ── Secure storage adapter (native only) ──────────────────────────────────────
// Supabase needs somewhere to persist the JWT session between app restarts.
// On native we use expo-secure-store (encrypted keychain/keystore).
// On web we fall back to localStorage (Supabase default).

const ExpoSecureStoreAdapter =
  Platform.OS !== 'web'
    ? {
        getItem:    (key: string) => SecureStore.getItemAsync(key),
        setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      }
    : undefined;   // undefined → Supabase uses localStorage on web

// ── Client ────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:          ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,   // not a browser; no OAuth redirect URL parsing
  },
});
