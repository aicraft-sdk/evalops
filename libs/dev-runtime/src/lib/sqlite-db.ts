// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof import('better-sqlite3');
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SQLite schema imported lazily to avoid circular deps
let _db: BetterSQLite3Database<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSqliteDb(): BetterSQLite3Database<any> {
  if (_db) return _db;

  const devDir = join(homedir(), '.evalops');
  mkdirSync(devDir, { recursive: true });
  // Allows tests to point at an isolated, disposable SQLite file instead of
  // the real developer dev.db (which is shared/persisted across `evalops dev`
  // runs and must not be polluted or relied upon for repeatable test state).
  const dbPath = process.env['EVALOPS_DEV_DB_PATH'] || join(devDir, 'dev.db');

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Drizzle's Postgres-shaped `.default(sql\`gen_random_uuid()\`)` /
  // `.defaultNow()` column defaults are injected into the generated INSERT
  // statement client-side whenever the column is omitted from `.values()` —
  // regardless of which dialect the table was originally declared for. Since
  // repositories are written once against the Postgres schema and reused
  // as-is against this SQLite connection in dev mode, register the two
  // Postgres-only functions those defaults call so such inserts succeed
  // here the same way they do against real Postgres.
  sqlite.function('now', () => new Date().toISOString());
  sqlite.function('gen_random_uuid', () => randomUUID());

  _db = drizzle(sqlite);
  return _db;
}

/** Reset the cached db instance (for testing) */
export function _resetSqliteDb(): void {
  _db = null;
}
