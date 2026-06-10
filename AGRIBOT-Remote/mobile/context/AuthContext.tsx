import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import {
  createUser,
  getUserAuthRecordByEmail,
  getUserById,
  registerDatabase,
  updateBiometricEnrollment,
  initDB,
} from '@/db/database';
import type { AuthContextType, User } from '@/types';
import { hashPassword, isPasswordValid, verifyPassword } from '@/utils/auth';
import {
  authenticateWithBiometrics,
  getBiometricSession,
  isBiometricAvailable,
  saveBiometricSession,
} from '@/utils/biometrics';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricUserId, setBiometricUserId] = useState<number | null>(null);
  const [dbInitialized, setDbInitialized] = useState(false);

  // Initialize database on mount (native only)
  useEffect(() => {
    const initializeDatabase = async () => {
      if (Platform.OS === 'web') {
        setDbInitialized(true);
        return;
      }

      try {
        // On native, get the database from expo-sqlite provider
        // The database is passed via SQLiteProvider context
        const sqlite = await (eval("import('expo-sqlite')") as Promise<any>);
        const db = await sqlite.openDatabaseAsync('agribot.db');
        
        // Initialize database tables
        await initDB(db);
        setDbInitialized(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
        // Don't stop the app, just continue without local database
        setDbInitialized(true);
      }
    };

    initializeDatabase();
  }, []);

  const restoreSession = useCallback(async () => {
    if (!dbInitialized) {
      return;
    }

    try {
      const userId = await getBiometricSession();
      if (userId === null) {
        return;
      }

      // Found a biometric session - show the biometric login screen
      setBiometricUserId(userId);
    } catch (error) {
      console.warn('Failed to restore biometric session:', error);
    }
  }, [dbInitialized]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await restoreSession();
      } catch (error) {
        console.warn(
          error instanceof Error ? error.message : 'Failed to restore local auth session.'
        );
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [restoreSession]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password) {
        throw new Error('Email and password are required.');
      }

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
    } catch (error) {
      throw new Error(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      enrollBiometric: boolean
    ): Promise<void> => {
      setIsLoading(true);

      try {
        const normalizedUsername = username.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedUsername || !normalizedEmail) {
          throw new Error('Username and email are required.');
        }

        if (!isPasswordValid(password)) {
          throw new Error(
            'Password must be at least 8 characters and include at least one number.'
          );
        }

        const passwordHash = await hashPassword(password);
        let createdUser = await createUser(normalizedUsername, normalizedEmail, passwordHash);

        if (enrollBiometric) {
          const available = await isBiometricAvailable();
          if (available) {
            const authenticated = await authenticateWithBiometrics('enable fingerprint login');
            if (authenticated) {
              await saveBiometricSession(createdUser.id);
              await updateBiometricEnrollment(createdUser.id, true);
              createdUser = {
                ...createdUser,
                biometric_enrolled: true,
              };
            }
          }
        }

        setUser(createdUser);
      } catch (error) {
        throw new Error(
          `Signup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

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

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      // Keep biometric session so users can sign back in with fingerprint.
      setUser(null);
    } catch (error) {
      throw new Error(
        `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      biometricUserId,
      login,
      signup,
      logout,
      biometricLogin,
    }),
    [biometricLogin, biometricUserId, isLoading, login, logout, signup, user]
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
