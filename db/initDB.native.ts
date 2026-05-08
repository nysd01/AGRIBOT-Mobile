import { registerDatabase } from './database';

export async function initializeNativeDatabase(): Promise<void> {
  try {
    const { useSQLiteContext } = require('expo-sqlite');
    const sqlite = useSQLiteContext();
    registerDatabase(sqlite);
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}
