import { Tabs, useRootNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';

export default function TabLayout() {
  const router = useRouter();
  const rootNavigation = useRootNavigation();
  const { user, isLoading } = useAuth();

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
        tabBarActiveTintColor: '#72F88A',
        tabBarInactiveTintColor: '#6C7473',
        tabBarStyle: {
          backgroundColor: '#1B1F1C',
          borderTopWidth: 0,
          marginHorizontal: 12,
          marginBottom: 10,
          borderRadius: 22,
          height: 74,
          position: 'absolute',
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
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
    </Tabs>
  );
}
