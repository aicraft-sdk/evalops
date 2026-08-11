/**
 * Integration test against a real (not mocked) Postgres database — proves
 * RunsRepository.createPolicyViolation() actually persists every column,
 * including the optional `evidence` jsonb field, now that the payload is
 * typed from `typeof policyViolations.$inferSelect` instead of
 * `Record<string, unknown>` + `as any`.
 *
 * Root cause under test (pre-fix): `db.insert(policyViolations).values(data as any)`
 * where `data: Record<string, unknown>`. The `as any` cast means Drizzle
 * silently drops any key in `data` that does not correspond to an actual
 * column on `policy_violations` — no error, no warning. This is the same
 * class of bug fixed in RunsRepository.update()/updateStatus()/completeRun()
 * (see runs.repository.policy-score.spec.ts for the original incident).
 *
 * This test spins up a throwaway database and replays every *.sql file under
 * libs/shared-db/migrations/ before running, mirroring
 * runs.repository.policy-score.spec.ts and agents.repository.retype.spec.ts.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_shared_db_test_policy_violation';
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
        await target.query(sqlText);
      }
    }
  } finally {
    await target.end();
  }
}

describe('RunsRepository.createPolicyViolation() — real Postgres persistence', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
  });

  afterAll(async () => {
    const { pool } = await import('../db');
    await pool?.end();
  });

  it('persists every column of a real caller payload, including evidence', async () => {
    const { RunsRepository } = await import('./runs.repository');
    const repository = new RunsRepository();

    const run = await repository.create({
      name: 'policy-violation-test-run',
      evalSpecId: 'eval-spec-1',
      status: 'running',
      triggeredBy: 'test-user',
      organizationId: 'org-1',
    });

    // Shape mirrors apps/evaluation-service policies.service.ts's real call site.
    const violation = await repository.createPolicyViolation({
      runId: run.id,
      policyId: 'policy-1',
      ruleIndex: 2,
      severity: 'fail',
      message: 'threshold exceeded',
      evidence: { metric: 'accuracy', value: 0.42 },
      organizationId: 'org-1',
    });

    expect(violation.runId).toBe(run.id);
    expect(violation.policyId).toBe('policy-1');
    expect(violation.ruleIndex).toBe(2);
    expect(violation.severity).toBe('fail');
    expect(violation.message).toBe('threshold exceeded');
    expect(violation.evidence).toEqual({ metric: 'accuracy', value: 0.42 });
    expect(violation.organizationId).toBe('org-1');

    const found = await repository.findPolicyViolationsByRun(run.id);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual(violation);
  });
});
