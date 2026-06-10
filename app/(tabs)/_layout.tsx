import { Tabs, useRootNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth }         from '@/context/AuthContext';
import { useAppMode }      from '@/context/AppModeContext';
import { useAlertMonitor } from '@/hooks/use-alert-monitor';

/**
 * TabLayout — mounted once for the entire tab session.
 * Hosts the global alert monitor so flame/smoke notifications fire
 * on every screen, not just the Intelligence tab.
 */
export default function TabLayout() {
  const router          = useRouter();
  const rootNavigation  = useRootNavigation();
  const { user, isLoading } = useAuth();
  const { cloudConfig }     = useAppMode();

  // ── Global alert monitor ─────────────────────────────────────────────────
  // Watches sensor data and pushes OS notifications + emails on flame/smoke.
  // Only starts polling once the user is authenticated.
  useAlertMonitor(user?.email, cloudConfig);

  useEffect(() => {
    if (!isLoading && rootNavigation?.isReady() && !user) {
      router.replace('/login');
    }
  }, [isLoading, rootNavigation, router, user]);

  if (isLoading || !user) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   '#72F88A',
        tabBarInactiveTintColor: '#6C7473',
        tabBarStyle: {
          backgroundColor: '#1B1F1C',
          borderTopWidth:  0,
          marginHorizontal: 12,
          marginBottom:    10,
          borderRadius:    22,
          height:          74,
          position:        'absolute',
          paddingTop:      8,
          paddingBottom:   10,
        },
        tabBarLabelStyle: {
          fontSize:      11,
          fontWeight:    '700',
          letterSpacing: 1.1,
        },
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: 'MISSION',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="remote"
        options={{
          title: 'REMOTE',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-cog-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="intelligence"
        options={{
          title: 'INTELLIGENCE',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="brain" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="sensors"
        options={{
          title: 'SENSORS',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="access-point" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: 'NETWORK',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="wifi-cog" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'MAP',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-path" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'ANALYTICS',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-line" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
