import { sql, SQL } from 'drizzle-orm';

const isDevMode = () => process.env['EVALOPS_DEV_MODE'] === '1';

/**
 * Extract a value from a JSON/JSONB column by key.
 * Postgres: col->>'key'
 * SQLite: json_extract(col, '$.key')
 */
export function jsonExtract(colName: string, key: string): SQL {
  if (isDevMode()) {
    return sql.raw(`json_extract(${colName}, '$.${key}')`);
  }
  return sql.raw(`${colName}->>'${key}'`);
}

/**
 * Check if a JSON array column contains a value.
 * Postgres: col @> ARRAY[value]::jsonb
 * SQLite: EXISTS (SELECT 1 FROM json_each(col) WHERE value = ?)
 */
export function jsonContains(colName: string, value: string): SQL {
  if (isDevMode()) {
    return sql`EXISTS (SELECT 1 FROM json_each(${sql.raw(colName)}) WHERE value = ${value})`;
  }
  return sql`${sql.raw(colName)} @> ${JSON.stringify([value])}::jsonb`;
}

/** Postgres SQLSTATE for a unique-constraint violation. */
const POSTGRES_UNIQUE_VIOLATION = '23505';

/** better-sqlite3's error code for a UNIQUE constraint violation (EVALOPS_DEV_MODE driver). */
const SQLITE_UNIQUE_VIOLATION = 'SQLITE_CONSTRAINT_UNIQUE';

/**
 * True when `error` is a unique-constraint-violation error from either
 * database driver this repo runs against: Postgres (`pg`/node-postgres,
 * code '23505') in production, or `better-sqlite3` (code
 * 'SQLITE_CONSTRAINT_UNIQUE') under EVALOPS_DEV_MODE. Both drivers expose
 * the code as a `.code` string property on the thrown error.
 *
 * Both codes are checked unconditionally (not branched on `isDevMode()`) -
 * the thrown error's own shape is the source of truth for which driver
 * produced it, so this stays correct even if a caller's dev-mode detection
 * is stale.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === POSTGRES_UNIQUE_VIOLATION || code === SQLITE_UNIQUE_VIOLATION;
}
