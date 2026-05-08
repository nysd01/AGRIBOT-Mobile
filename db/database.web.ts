// Web-specific database implementation
// Uses localStorage instead of SQLite

import type { User } from '@/types';

type UserRecord = User & { password_hash: string };

const USERS_STORAGE_KEY = 'agribot_users';

export function useDB(): any {
  throw new Error('SQLite is not available on web platform');
}

export function registerDatabase(db: any): void {
  // No-op on web
}

function getDatabase(): any {
  throw new Error('SQLite database is not available on web');
}

export async function initDB(): Promise<void> {
  // Initialize localStorage-based "database" on web
  if (!localStorage.getItem(USERS_STORAGE_KEY)) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify([]));
  }
}

function mapRowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    biometric_enrolled: Boolean(row.biometric_enrolled),
    created_at: row.created_at,
  };
}

function getAllUsers(): UserRecord[] {
  const stored = localStorage.getItem(USERS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveUsers(users: UserRecord[]): void {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export async function createUser(
  username: string,
  email: string,
  passwordHash: string
): Promise<User> {
  const users = getAllUsers();
  const newUser: UserRecord = {
    id: Math.max(...users.map((u) => u.id), 0) + 1,
    username,
    email,
    password_hash: passwordHash,
    biometric_enrolled: false,
    created_at: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);
  return mapRowToUser(newUser);
}

export async function getUserAuthRecordByEmail(email: string): Promise<UserRecord | null> {
  const users = getAllUsers();
  return users.find((u) => u.email === email) || null;
}

export async function getUserById(id: number): Promise<User | null> {
  const users = getAllUsers();
  const user = users.find((u) => u.id === id);
  return user ? mapRowToUser(user) : null;
}

export async function updateBiometricEnrollment(userId: number, enrolled: boolean): Promise<void> {
  const users = getAllUsers();
  const user = users.find((u) => u.id === userId);
  if (user) {
    user.biometric_enrolled = enrolled ? 1 : 0;
    saveUsers(users);
  }
}
