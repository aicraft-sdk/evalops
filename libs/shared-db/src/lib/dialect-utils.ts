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
