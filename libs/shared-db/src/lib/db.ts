import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

if (!process.env['DATABASE_URL']) {
  throw new Error(
    'DATABASE_URL must be set. Did you forget to provision a database?'
  );
}

// Single pool shared across the process lifetime.
export const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// Global (pool-backed) Drizzle instance — used outside HTTP requests
// (migrations, background jobs, tests).
const globalDb = drizzle(pool, { schema });

// Per-request ALS store: holds a dedicated Drizzle instance that already has
// app.org_id set on its reserved PoolClient.
const requestDbStore = new AsyncLocalStorage<NodePgDatabase<typeof schema>>();

/**
 * Transparent Proxy: routes every method/property access to the per-request
 * Drizzle instance when one is active (inside withTenantContext), falling back
 * to the global pool-backed instance otherwise.
 *
 * Existing service code that does `import { db } from '@evalops/shared-db'`
 * continues to work without any changes.
 */
export const db = new Proxy(globalDb, {
  get(target, prop: string | symbol) {
    const src = requestDbStore.getStore() ?? target;
    const val = (src as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(src) : val;
  },
}) as NodePgDatabase<typeof schema>;

/**
 * Acquires a dedicated PoolClient, sets app.org_id on it, then runs `fn`
 * inside an AsyncLocalStorage scope where `db.*` routes to that client.
 *
 * Called once per HTTP request by OrgContextInterceptor.
 * When orgId is '', the config is still set (clears any stale value from a
 * prior request that might have leaked if a connection was recycled).
 *
 * @param orgId  The tenant identifier extracted from the JWT.
 * @param fn     The request handler thunk to execute.
 */
export async function withTenantContext<T>(
  orgId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.org_id', $1, false)`, [orgId || '']);
    const tenantDb = drizzle(client, { schema }) as NodePgDatabase<typeof schema>;
    return await requestDbStore.run(tenantDb, fn);
  } finally {
    try {
      await client.query(`SELECT set_config('app.org_id', '', false)`, []);
    } catch {
      // Best-effort cleanup; connection is released regardless.
    }
    client.release();
  }
}
