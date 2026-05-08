import { useRouter, useRootNavigation } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const router = useRouter();
  const rootNavigation = useRootNavigation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !rootNavigation?.isReady()) {
      return;
    }

    router.replace(user ? '/(tabs)' : '/login');
  }, [isLoading, rootNavigation, router, user]);

  return null;
}
