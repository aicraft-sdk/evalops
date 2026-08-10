/**
 * Integration test against a real (not mocked) Postgres database — proves
 * RunsRepository.update() actually persists `policyScore`.
 *
 * Root cause under test: RunsRepository.update() does `db.update(runs).set(data as any)`.
 * The `as any` cast means Drizzle silently drops any key in `data` that does not
 * correspond to an actual column on the `runs` table — no error, no warning.
 * `evaluation.service.ts` writes `policyScore: policyResult.score` on every run,
 * but (pre-fix) the `runs` table has no `policy_score` column at all, so the
 * value vanishes silently while `decision` (a real column) persists correctly.
 *
 * This test spins up a throwaway database and replays every *.sql file under
 * libs/shared-db/migrations/ (in order) before each run, so it also proves the
 * migration itself works — not just the schema.ts change.
 *
 * DATABASE_URL must be set to a real reachable Postgres server via the
 * "test" target's env before this file's module graph loads '../db' (env is
 * read at module-load time, matching db.ts's own documented constraint).
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_shared_db_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// db.ts reads process.env['DATABASE_URL'] at module-load time — must be set
// before the dynamic import inside the test below.
process.env['DATABASE_URL'] = TEST_DATABASE_URL;

async function resetAndMigrateTestDatabase(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }

  const target = new Client({ connectionString: TEST_DATABASE_URL });
  await target.connect();
  try {
    const migrationsDir = join(__dirname, '../../../migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sqlText = readFileSync(join(migrationsDir, file), 'utf-8');
      if (sqlText.includes('--> statement-breakpoint')) {
        for (const statement of sqlText.split('--> statement-breakpoint')) {
          const trimmed = statement.trim();
          if (trimmed) {
            await target.query(trimmed);
          }
        }
      } else if (sqlText.trim()) {
        // node-postgres's simple query protocol runs multi-statement strings
        // fine as long as no parameters are used (true for all DDL here).
        await target.query(sqlText);
      }
    }
  } finally {
    await target.end();
  }
}

describe('RunsRepository.update() — policyScore persistence (real Postgres)', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
  });

  afterAll(async () => {
    // Close the shared connection pool opened by '../db' so jest workers
    // exit cleanly instead of being force-killed on an open handle.
    const { pool } = await import('../db');
    await pool?.end();
  });

  it('persists policyScore through update() and reads it back unchanged', async () => {
    // Imported dynamically so the module (and its `db` singleton) only loads
    // after DATABASE_URL is set and the throwaway database is migrated.
    const { RunsRepository } = await import('./runs.repository');
    const repository = new RunsRepository();

    const created = await repository.create({
      name: 'policy-score-test-run',
      evalSpecId: 'eval-spec-1',
      status: 'running',
      triggeredBy: 'test-user',
      organizationId: 'org-1',
    });

    const updated = await repository.update(created.id, {
      decision: 'pass',
      policyScore: 87,
    });

    expect(updated).toBeDefined();
    expect(updated?.decision).toBe('pass');
    // Bracket + Record cast: avoids a compile error before the schema fix
    // lands (the field does not exist on the inferred Run type yet), while
    // still asserting the real runtime value read back from Postgres.
    expect((updated as unknown as Record<string, unknown>)?.['policyScore']).toBe(
      87,
    );

    const reread = await repository.findById(created.id);
    expect((reread as unknown as Record<string, unknown>)?.['policyScore']).toBe(
      87,
    );
  });
});
