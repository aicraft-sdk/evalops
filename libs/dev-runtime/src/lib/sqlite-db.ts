// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SQLite schema imported lazily to avoid circular deps
let _db: BetterSQLite3Database<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSqliteDb(): BetterSQLite3Database<any> {
  if (_db) return _db;

  const devDir = join(homedir(), '.evalops');
  mkdirSync(devDir, { recursive: true });
  const dbPath = join(devDir, 'dev.db');

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle(sqlite);
  return _db;
}

/** Reset the cached db instance (for testing) */
export function _resetSqliteDb(): void {
  _db = null;
}
