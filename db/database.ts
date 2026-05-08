import type { User } from '@/types';

type UserRecord = User & { password_hash: string };

let database: any = null;

export function useDB(): any {
  throw new Error('SQLite is not available on web platform');
}

export function registerDatabase(db: any): void {
  database = db;
}

function getDatabase(): any {
  if (!database) {
    throw new Error('SQLite database is not initialized yet.');
  }

  return database;
}

function mapRowToUser(row: {
  id: number;
  username: string;
  email: string;
  biometric_enrolled: number;
  created_at: string;
}): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    biometric_enrolled: row.biometric_enrolled === 1,
    created_at: row.created_at,
  };
}

async function getUserRecordByEmail(email: string): Promise<UserRecord | null> {
  try {
    const db = getDatabase();
    const row = await db.getFirstAsync<{
      id: number;
      username: string;
      email: string;
      password_hash: string;
      biometric_enrolled: number;
      created_at: string;
    }>('SELECT * FROM users WHERE email = ?', email);

    if (!row) {
      return null;
    }

    return {
      ...mapRowToUser(row),
      password_hash: row.password_hash,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch user record by email: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function initDB(db: any = getDatabase()): Promise<void> {
  try {
    registerDatabase(db);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        biometric_enrolled INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (error) {
    throw new Error(
      `Failed to initialize database: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function createUser(
  username: string,
  email: string,
  passwordHash: string
): Promise<User> {
  try {
    const db = getDatabase();
    const result = await db.runAsync(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      username,
      email,
      passwordHash
    );

    const createdUser = await getUserById(Number(result.lastInsertRowId));
    if (!createdUser) {
      throw new Error('User was created, but could not be read back from SQLite.');
    }

    return createdUser;
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new Error('A user with that email or username already exists.');
    }

    throw new Error(
      `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const record = await getUserRecordByEmail(email);
    if (!record) {
      return null;
    }

    const { password_hash: _ignored, ...safeUser } = record;
    return safeUser;
  } catch (error) {
    throw new Error(
      `Failed to fetch user by email: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function getUserAuthRecordByEmail(
  email: string
): Promise<UserRecord | null> {
  try {
    return await getUserRecordByEmail(email);
  } catch (error) {
    throw new Error(
      `Failed to fetch auth record by email: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function getUserByUsername(username: string): Promise<User | null> {
  try {
    const db = getDatabase();
    const row = await db.getFirstAsync<{
      id: number;
      username: string;
      email: string;
      biometric_enrolled: number;
      created_at: string;
    }>(
      'SELECT id, username, email, biometric_enrolled, created_at FROM users WHERE username = ?',
      username
    );

    return row ? mapRowToUser(row) : null;
  } catch (error) {
    throw new Error(
      `Failed to fetch user by username: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function getUserById(id: number): Promise<User | null> {
  try {
    const db = getDatabase();
    const row = await db.getFirstAsync<{
      id: number;
      username: string;
      email: string;
      biometric_enrolled: number;
      created_at: string;
    }>(
      'SELECT id, username, email, biometric_enrolled, created_at FROM users WHERE id = ?',
      id
    );

    return row ? mapRowToUser(row) : null;
  } catch (error) {
    throw new Error(
      `Failed to fetch user by id: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function updateBiometricEnrollment(
  userId: number,
  enabled: boolean
): Promise<void> {
  try {
    const db = getDatabase();
    await db.runAsync(
      'UPDATE users SET biometric_enrolled = ? WHERE id = ?',
      enabled ? 1 : 0,
      userId
    );
  } catch (error) {
    throw new Error(
      `Failed to update biometric enrollment: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}
