/**
 * Integration test against a real (not mocked) Postgres database — proves
 * the judge_cache migration applies cleanly and JudgeCacheRepository
 * persists/reads back cache rows scoped to their organization.
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
const TEST_DB_NAME = 'evalops_judge_cache_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// db.ts reads process.env['DATABASE_URL'] at module-load time — must be set
// before the dynamic import inside the test below.
process.env['DATABASE_URL'] = TEST_DATABASE_URL;

const RLS_TEST_ROLE = 'judge_cache_rls_test_role';
const RLS_TEST_ROLE_PASSWORD = 'judge_cache_rls_test_pw';
const RLS_TEST_ROLE_URL = `postgresql://${RLS_TEST_ROLE}:${RLS_TEST_ROLE_PASSWORD}@localhost:5432/${TEST_DB_NAME}`;

/**
 * Provisions a genuine NON-superuser, NOBYPASSRLS Postgres role scoped only
 * to the throwaway test database, so a real RLS-enforcement test can connect
 * as an app-shaped principal rather than the `postgres` superuser (which
 * silently bypasses RLS entirely and would make an RLS test vacuous).
 *
 * Runs after resetAndMigrateTestDatabase() so the `judge_cache` table exists
 * for the GRANT statements. The role itself is cluster-level and persists
 * across test-database drop/recreate cycles (roles are not dropped by
 * `DROP DATABASE`), so creation uses a DO-block guard against
 * `duplicate_object` rather than requiring a fresh role name every run.
 */
async function provisionNonSuperuserTestRole(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`
      DO $$
      BEGIN
        CREATE ROLE ${RLS_TEST_ROLE} LOGIN PASSWORD '${RLS_TEST_ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END
      $$;
    `);
    await admin.query(
      `GRANT CONNECT ON DATABASE ${TEST_DB_NAME} TO ${RLS_TEST_ROLE}`,
    );
  } finally {
    await admin.end();
  }

  // GRANT on schema/table must be issued from a connection to the target
  // database, and must come from a role with privilege to grant (the table
  // owner - `postgres`, connecting via ADMIN_DATABASE_URL's credentials but
  // against the target db - is both).
  const targetAdmin = new Client({ connectionString: TEST_DATABASE_URL });
  await targetAdmin.connect();
  try {
    await targetAdmin.query(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await targetAdmin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON judge_cache TO ${RLS_TEST_ROLE}`,
    );
  } finally {
    await targetAdmin.end();
  }
}

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

describe('judge_cache migration + JudgeCacheRepository (real Postgres)', () => {
  jest.setTimeout(30000);
  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
    await provisionNonSuperuserTestRole();
  });
  afterAll(async () => {
    const { pool } = await import('../db');
    await pool?.end();
  });

  it('creates and reads back a cache row scoped to its organization', async () => {
    const { JudgeCacheRepository } = await import('./judge-cache.repository');
    const repo = new JudgeCacheRepository();

    const created = await repo.create({
      cacheKey: 'abc123',
      evaluatorName: 'evaluateFactuality',
      sampleId: 'sample-1',
      score: 0.85,
      reasoning: 'accurate',
      cost: '0.001',
      model: 'gpt-4',
      temperature: 0.1,
      seed: 42,
      organizationId: 'org-1',
    });
    expect(created.cacheKey).toBe('abc123');

    const found = await repo.findByCacheKey('abc123');
    expect(found?.score).toBe(0.85);
    expect(found?.reasoning).toBe('accurate');

    const missing = await repo.findByCacheKey('does-not-exist');
    expect(missing).toBeUndefined();
  });

  it('rejects a duplicate cacheKey (unique index enforced)', async () => {
    const { JudgeCacheRepository } = await import('./judge-cache.repository');
    const repo = new JudgeCacheRepository();
    await repo.create({
      cacheKey: 'dup-key', evaluatorName: 'x', score: 0.5, cost: '0',
      model: 'gpt-4', organizationId: 'org-1',
    });
    await expect(
      repo.create({
        cacheKey: 'dup-key', evaluatorName: 'y', score: 0.9, cost: '0',
        model: 'gpt-4', organizationId: 'org-1',
      }),
    ).rejects.toThrow();
  });

  it('enforces RLS as a real non-superuser role: org A cannot see or write over org B rows, and vice versa', async () => {
    // Deliberately does NOT use JudgeCacheRepository here - that repository
    // goes through the shared `db` pool, which this test file's own
    // ADMIN_DATABASE_URL/TEST_DATABASE_URL setup always connects to as the
    // `postgres` superuser. Postgres superusers (and any BYPASSRLS role)
    // ignore RLS policies unconditionally unless the table also has FORCE
    // ROW LEVEL SECURITY, which this migration does not set - so a test
    // driven through the repository/superuser pool would pass even if the
    // tenant_isolation policy were completely broken or missing. Connecting
    // directly as RLS_TEST_ROLE (a real NOSUPERUSER/NOBYPASSRLS role,
    // provisioned in provisionNonSuperuserTestRole() above) is what actually
    // exercises the policy.
    const orgAClient = new Client({ connectionString: RLS_TEST_ROLE_URL });
    await orgAClient.connect();
    const orgBClient = new Client({ connectionString: RLS_TEST_ROLE_URL });
    await orgBClient.connect();

    try {
      await orgAClient.query(`SELECT set_config('app.org_id', 'org-rls-a', false)`);
      await orgAClient.query(
        `INSERT INTO judge_cache (cache_key, evaluator_name, score, cost, model, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['rls-key-a', 'evaluateFactuality', 0.5, '0', 'gpt-4', 'org-rls-a'],
      );

      await orgBClient.query(`SELECT set_config('app.org_id', 'org-rls-b', false)`);

      // Org B's session cannot SELECT org A's row - RLS silently filters it,
      // it does not error.
      const orgBRead = await orgBClient.query(
        `SELECT * FROM judge_cache WHERE cache_key = $1`,
        ['rls-key-a'],
      );
      expect(orgBRead.rows).toHaveLength(0);

      // Org B's session cannot INSERT a row claiming organization_id
      // 'org-rls-a' while its own app.org_id session variable is
      // 'org-rls-b' - the policy's USING clause (also used as the implicit
      // WITH CHECK, since none is declared separately) rejects the write.
      await expect(
        orgBClient.query(
          `INSERT INTO judge_cache (cache_key, evaluator_name, score, cost, model, organization_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ['rls-key-b-spoofed', 'evaluateFactuality', 0.5, '0', 'gpt-4', 'org-rls-a'],
        ),
      ).rejects.toThrow(/row-level security/i);

      // Org A's own session CAN read its own row back - confirms the
      // filtering above is genuinely org-scoped, not a blanket denial.
      const orgARead = await orgAClient.query(
        `SELECT * FROM judge_cache WHERE cache_key = $1`,
        ['rls-key-a'],
      );
      expect(orgARead.rows).toHaveLength(1);
      expect(orgARead.rows[0].organization_id).toBe('org-rls-a');
    } finally {
      await orgAClient.end();
      await orgBClient.end();
    }
  });
});
