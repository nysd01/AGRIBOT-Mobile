import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Root layout component that handles both web and native platforms.
 * - On web: Renders without SQLiteProvider (no database)
 * - On native: Dynamically loads and uses SQLiteProvider with database initialization
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [SQLiteProvider, setSQLiteProvider] = useState<any>(null);
  const [dbReady, setDbReady] = useState(false);

  // Initialize SQLite only on native platforms, never on web
  useEffect(() => {
    // Web platform: skip database entirely
    if (Platform.OS === 'web') {
      setDbReady(true);
      return;
    }

    // Native platform: load SQLite dynamically
    const initSQLite = async () => {
      try {
        // This import is only executed on native, not analyzed by web bundler
        const sqlite = await (eval("import('expo-sqlite')") as Promise<any>);
        setSQLiteProvider(() => sqlite.SQLiteProvider);
        setDbReady(true);
      } catch (error) {
        console.error('Failed to initialize SQLite:', error);
        setDbReady(true); // Continue without database on error
      }
    };

    initSQLite();
  }, []);

  const screenConfig = (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      <Stack.Screen
        name="modal-settings"
        options={{
          presentation: 'modal',
          headerShown: false,
          animationEnabled: true,
        }}
      />
    </Stack>
  );

  const authContent = (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        {screenConfig}
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );

  // Show loading while initializing on native
  if (!dbReady) {
    return null;
  }

  // On native with SQLite ready, wrap with SQLiteProvider
  if (Platform.OS !== 'web' && SQLiteProvider) {
    return (
      <SQLiteProvider databaseName="agribot.db" useSuspense>
        {authContent}
      </SQLiteProvider>
    );
  }

  // On web or native without database, render content directly
  return authContent;
}
