import { Stack, useRootNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

export default function AuthLayout() {
  const router = useRouter();
  const rootNavigation = useRootNavigation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && rootNavigation?.isReady() && user) {
      router.replace('/(tabs)');
    }
  }, [isLoading, rootNavigation, router, user]);

  return <Stack screenOptions={{ headerShown: false }} />;
}