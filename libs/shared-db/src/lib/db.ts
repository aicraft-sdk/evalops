import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
import { drizzle as pgDrizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// IMPORTANT: evaluated at module load time — EVALOPS_DEV_MODE must be set before any import that loads this module
const isDevMode = process.env['EVALOPS_DEV_MODE'] === '1';

// ---------------------------------------------------------------------------
// Production path (Postgres + RLS)
// ---------------------------------------------------------------------------
let pool: Pool | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- union type resolved at runtime
let globalDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- union type resolved at runtime
const requestDbStore = new AsyncLocalStorage<any>();

if (isDevMode) {
  // SQLite path — lazy import to avoid requiring better-sqlite3 in prod builds.
  // Imported via path alias which the Nx build resolves; the eslint-disable
  // suppresses the tsc cross-lib TS6059 warning (known @nx/js:tsc limitation).
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const devRuntime = require('@evalops/dev-runtime');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle SQLite type resolved at runtime
  globalDb = (devRuntime as any).getSqliteDb();
} else {
  if (!process.env['DATABASE_URL']) {
    throw new Error(
      'DATABASE_URL must be set. For embedded dev mode (no DB required), set EVALOPS_DEV_MODE=1.',
    );
  }
  pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  globalDb = pgDrizzle(pool, { schema });
}

/**
 * Transparent Proxy: routes every method/property access to the per-request
 * Drizzle instance when one is active (inside withTenantContext), falling back
 * to the global pool-backed instance otherwise.
 *
 * In dev mode (SQLite) there is no per-request isolation — the globalDb is
 * always used directly. RLS is the responsibility of repositories in prod.
 */
export const db = new Proxy(globalDb, {
  get(target, prop: string | symbol) {
    const src = requestDbStore.getStore() ?? target;
    const val = (src as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function'
      ? (val as (...args: unknown[]) => unknown).bind(src)
      : val;
  },
}) as NodePgDatabase<typeof schema>;

/**
 * Export pool for cases that need direct pool access (migrations, etc.).
 * Will be null in dev mode.
 */
export { pool };

/**
 * Context object carrying tenant-scoped identity for RLS session variables.
 */
export interface TenantContext {
  orgId: string;
  userId: string;
  role: string;
}

/**
 * In dev mode: simple AsyncLocalStorage run (no PoolClient / set_config).
 * In prod mode: acquires a dedicated PoolClient, sets app.org_id / app.user_id / app.role.
 */
export async function withTenantContext<T>(
  ctx: TenantContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (isDevMode) {
    // In SQLite dev mode, org isolation is handled at the application layer.
    // Store orgId in the ALS for repositories that need it.
    return orgContextStore.run(ctx.orgId, () => requestDbStore.run(globalDb, fn));
  }

  const client = await pool!.connect();
  try {
    await client.query(`SELECT set_config('app.org_id', $1, false)`, [ctx.orgId]);
    await client.query(`SELECT set_config('app.user_id', $1, false)`, [ctx.userId]);
    await client.query(`SELECT set_config('app.role', $1, false)`, [ctx.role]);
    const tenantDb = pgDrizzle(client, { schema }) as NodePgDatabase<typeof schema>;
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

/**
 * Org context store — tracks the current org ID in AsyncLocalStorage.
 * Used by repositories to filter by org in dev mode (no Postgres RLS).
 */
export const orgContextStore = new AsyncLocalStorage<string>();

/**
 * Run fn in the context of the given org.
 * In dev mode: sets the org in AsyncLocalStorage for org-filtered queries.
 * In prod mode: withTenantContext handles RLS; this is a passthrough.
 */
export async function withOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  return orgContextStore.run(orgId, fn);
}

/**
 * Get the current org ID from AsyncLocalStorage.
 * Returns undefined when called outside a request context.
 */
export function getCurrentOrg(): string | undefined {
  return orgContextStore.getStore();
}
