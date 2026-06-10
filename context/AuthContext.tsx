/**
 * AuthContext
 * ───────────
 * Dual-layer authentication:
 *
 * PRIMARY  → Local SQLite   (always works, even offline)
 *   Stores username, email, password hash, biometric flag.
 *   Source of truth for user profile data.
 *
 * SECONDARY → Supabase Auth (cloud, online only)
 *   Synced in the background on login / signup.
 *   Enables cross-device session restore and cloud email verification.
 *   Never blocks login — if offline, Supabase sync is skipped silently.
 *
 * Alert emails always use user.email which is consistent between both layers.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import type { Session as SupabaseSession } from '@supabase/supabase-js';

import {
  createUser,
  getUserAuthRecordByEmail,
  getUserById,
  updateBiometricEnrollment,
} from '@/db/database';
import type { AuthContextType, User } from '@/types';
import { hashPassword, isPasswordValid, verifyPassword } from '@/utils/auth';
import {
  authenticateWithBiometrics,
  getBiometricSession,
  isBiometricAvailable,
  saveBiometricSession,
} from '@/utils/biometrics';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,            setUser]            = useState<User | null>(null);
  const [isLoading,       setIsLoading]       = useState(true);
  const [biometricUserId, setBiometricUserId] = useState<number | null>(null);
  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(null);

  // ── Supabase cloud sync helpers ───────────────────────────────────────────
  // These never throw — failures are silently logged so offline mode is unaffected.

  /**
   * Sign in to Supabase in the background.
   * Called after a successful local login.
   */
  const syncSupabaseLogin = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Account may not exist in Supabase yet — try creating it
        if (error.message.includes('Invalid login credentials') ||
            error.message.includes('Email not confirmed') ||
            error.status === 400) {
          const { data: signUpData, error: signUpError } =
            await supabase.auth.signUp({ email, password });
          if (!signUpError && signUpData.session) {
            setSupabaseSession(signUpData.session);
            console.log('[Auth] Supabase account created and synced for', email);
          }
        } else {
          console.warn('[Auth] Supabase login sync skipped (offline or error):', error.message);
        }
      } else if (data.session) {
        setSupabaseSession(data.session);
        console.log('[Auth] Supabase session synced for', email);
      }
    } catch {
      // Network error — device is offline, Supabase sync skipped
      console.warn('[Auth] Supabase unreachable — running in local-only mode.');
    }
  }, []);

  /**
   * Register in Supabase in the background.
   * Called after a successful local signup.
   */
  const syncSupabaseSignup = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        // Already registered — try sign in instead
        if (error.message.includes('already registered') || error.status === 422) {
          await syncSupabaseLogin(email, password);
        } else {
          console.warn('[Auth] Supabase signup sync skipped:', error.message);
        }
      } else if (data.session) {
        setSupabaseSession(data.session);
        console.log('[Auth] Supabase account registered for', email);
      }
    } catch {
      console.warn('[Auth] Supabase unreachable — running in local-only mode.');
    }
  }, [syncSupabaseLogin]);

  // ── Session restore on mount ──────────────────────────────────────────────

  const restoreSession = useCallback(async () => {
    try {
      // 1. Restore local biometric session
      const userId = await getBiometricSession();
      if (userId !== null) {
        setBiometricUserId(userId);
      }

      // 2. Restore Supabase cloud session (works even without biometric)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSupabaseSession(session);

        // If we have a Supabase session but no local biometric session,
        // try to find the matching local user so they're not prompted to log in again
        if (userId === null && session.user?.email) {
          try {
            const localUser = await getUserAuthRecordByEmail(session.user.email);
            if (localUser) {
              const { password_hash: _ignored, ...safeUser } = localUser;
              setUser(safeUser);
              console.log('[Auth] Session restored from Supabase for', session.user.email);
            }
          } catch {
            // Local DB record not found — user will need to log in manually
          }
        }
      }
    } catch (error) {
      console.warn('Failed to restore session:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await restoreSession();
      } catch (error) {
        console.warn(
          error instanceof Error ? error.message : 'Failed to restore auth session.'
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void bootstrap();

    // Listen for Supabase auth state changes (token refresh, sign-out from another device, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [restoreSession]);

  // ── Login ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password) {
        throw new Error('Email and password are required.');
      }

      // ── WEB: SQLite not available — use Supabase Auth directly ───────────
      if (Platform.OS === 'web') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw new Error(error.message);
        if (data.session) setSupabaseSession(data.session);
        if (data.user) {
          setUser({
            id: 0,
            username: data.user.user_metadata?.username ?? normalizedEmail.split('@')[0],
            email: data.user.email ?? normalizedEmail,
            biometric_enrolled: false,
            created_at: data.user.created_at ?? new Date().toISOString(),
          });
        }
        return;
      }

      // ── NATIVE: Verify against local SQLite (works offline) ─────────────
      const foundUser = await getUserAuthRecordByEmail(normalizedEmail);
      if (!foundUser) {
        throw new Error('No account found with this email.');
      }

      const valid = await verifyPassword(password, foundUser.password_hash);
      if (!valid) {
        throw new Error('Incorrect password.');
      }

      const { password_hash: _ignored, ...safeUser } = foundUser;
      setUser(safeUser);

      // Sync with Supabase in the background (non-blocking)
      void syncSupabaseLogin(normalizedEmail, password);

    } catch (error) {
      throw new Error(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [syncSupabaseLogin]);

  // ── Signup ────────────────────────────────────────────────────────────────

  const signup = useCallback(async (
    username:        string,
    email:           string,
    password:        string,
    enrollBiometric: boolean,
  ): Promise<void> => {
    setIsLoading(true);
    try {
      const normalizedUsername = username.trim();
      const normalizedEmail    = email.trim().toLowerCase();

      if (!normalizedUsername || !normalizedEmail) {
        throw new Error('Username and email are required.');
      }
      if (!isPasswordValid(password)) {
        throw new Error(
          'Password must be at least 8 characters and include at least one number.'
        );
      }

      // ── WEB: SQLite not available — register via Supabase directly ───────
      if (Platform.OS === 'web') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { username: normalizedUsername } },
        });
        if (error) throw new Error(error.message);
        if (data.session) setSupabaseSession(data.session);
        setUser({
          id: 0,
          username: normalizedUsername,
          email: normalizedEmail,
          biometric_enrolled: false,
          created_at: new Date().toISOString(),
        });
        return;
      }

      // ── NATIVE: Create local SQLite record ───────────────────────────────
      const passwordHash  = await hashPassword(password);
      let   createdUser   = await createUser(normalizedUsername, normalizedEmail, passwordHash);

      if (enrollBiometric) {
        const available = await isBiometricAvailable();
        if (available) {
          const authenticated = await authenticateWithBiometrics('enable fingerprint login');
          if (authenticated) {
            await saveBiometricSession(createdUser.id);
            await updateBiometricEnrollment(createdUser.id, true);
            createdUser = { ...createdUser, biometric_enrolled: true };
          }
        }
      }

      setUser(createdUser);

      // ── Step 2: Register in Supabase in the background (non-blocking) ───
      void syncSupabaseSignup(normalizedEmail, password);

    } catch (error) {
      throw new Error(
        `Signup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [syncSupabaseSignup]);

  // ── Biometric login ───────────────────────────────────────────────────────

  const biometricLogin = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const sessionUserId = await getBiometricSession();
      if (sessionUserId === null) {
        throw new Error('No biometric session found.');
      }

      const authenticated = await authenticateWithBiometrics('sign in');
      if (!authenticated) {
        throw new Error('Fingerprint authentication failed.');
      }

      const sessionUser = await getUserById(sessionUserId);
      if (!sessionUser) {
        throw new Error('Stored biometric user no longer exists.');
      }

      setUser(sessionUser);
    } catch (error) {
      throw new Error(
        `Biometric login failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      setUser(null);

      // Sign out from Supabase in the background (non-blocking)
      void supabase.auth.signOut().catch(() => {});
      setSupabaseSession(null);

    } catch (error) {
      throw new Error(
        `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────
  // Prefer the Supabase-verified email when a cloud session is active;
  // fall back to the local SQLite email otherwise.

  const resolvedUser = useMemo(() => {
    if (!user) return null;
    const cloudEmail = supabaseSession?.user?.email;
    if (cloudEmail && cloudEmail === user.email) {
      // Both layers agree — return user as-is (email already correct)
      return user;
    }
    if (cloudEmail && !user.email) {
      // Edge case: local record missing email, use Supabase email
      return { ...user, email: cloudEmail };
    }
    return user;
  }, [user, supabaseSession]);

  const value = useMemo<AuthContextType>(
    () => ({
      user:           resolvedUser,
      isLoading,
      biometricUserId,
      login,
      signup,
      logout,
      biometricLogin,
    }),
    [biometricLogin, biometricUserId, isLoading, login, logout, resolvedUser, signup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
