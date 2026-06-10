import React from 'react';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { initDB } from '@/db/database';

/**
 * Native platform database provider.
 * Uses expo-sqlite's SQLiteProvider with an onInit callback to
 * create the schema and register the database instance before
 * any children render.
 */
async function onDatabaseInit(db: SQLiteDatabase): Promise<void> {
  await initDB(db);
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName="agribot.db" onInit={onDatabaseInit}>
      {children}
    </SQLiteProvider>
  );
}
