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
 * Context object carrying tenant-scoped identity for RLS session variables.
 */
export interface TenantContext {
  orgId: string;
  userId: string;
  role: string;
}

/**
 * Acquires a dedicated PoolClient, sets app.org_id / app.user_id / app.role on it,
 * then runs `fn` inside an AsyncLocalStorage scope where `db.*` routes to that client.
 *
 * Called once per HTTP request by OrgContextInterceptor.
 * All three config values are set unconditionally so stale values from a prior
 * connection in the pool are always overwritten.
 *
 * @param ctx  The tenant context extracted from the JWT (orgId, userId, role).
 * @param fn   The request handler thunk to execute.
 */
export async function withTenantContext<T>(
  ctx: TenantContext,
  fn: () => T | Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.org_id', $1, false)`, [ctx.orgId]);
    await client.query(`SELECT set_config('app.user_id', $1, false)`, [ctx.userId]);
    await client.query(`SELECT set_config('app.role', $1, false)`, [ctx.role]);
    const tenantDb = drizzle(client, { schema }) as NodePgDatabase<typeof schema>;
    return await requestDbStore.run(tenantDb, fn);
  } finally {
    try {
      await client.query(
        `SELECT set_config('app.org_id', '', false), set_config('app.user_id', '', false), set_config('app.role', '', false)`,
        [],
      );
    } catch {
      // Best-effort cleanup; connection is released regardless.
    }
    client.release();
  }
}
