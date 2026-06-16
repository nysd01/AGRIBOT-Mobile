import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { LogBox } from 'react-native';
import 'react-native-reanimated';

// Suppress Expo Go SDK 53 push-token warning — local notifications still work fine.
// Remote (FCM) push was removed from Expo Go; a dev build is needed for that.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications functionality is not fully supported',
]);

import { AuthProvider } from '@/context/AuthContext';
import { DatabaseProvider } from '@/components/DatabaseProvider';
import { ESP32Provider } from '@/context/ESP32Context';
import { AppModeProvider } from '@/context/AppModeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Root layout.
 *
 * DatabaseProvider is platform-specific:
 *  - Native  → DatabaseProvider.native.tsx  (expo-sqlite SQLiteProvider + schema init)
 *  - Web     → DatabaseProvider.web.tsx     (localStorage init)
 *
 * Metro resolves the correct file automatically — no eval() required.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <DatabaseProvider>
      <ESP32Provider>
      <AppModeProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="modal-settings"
              options={{
                presentation: 'modal',
                headerShown: false,
                animationEnabled: true,
              }}
            />
          </Stack>
          <StatusBar style="auto" />
        </AuthProvider>
      </ThemeProvider>
      </AppModeProvider>
      </ESP32Provider>
    </DatabaseProvider>
  );
}
