import React, { useEffect } from 'react';
import { initDB } from '@/db/database';

/**
 * Web platform database provider.
 * Initialises the localStorage-backed "database" on mount.
 * No SQLite involved on web.
 */
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void initDB();
  }, []);

  return <>{children}</>;
}
