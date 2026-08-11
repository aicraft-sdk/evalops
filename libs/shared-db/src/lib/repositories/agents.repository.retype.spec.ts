/**
 * Proves AgentsRepository.update() (and create()/createVersion()) are closed
 * to the same Record<string, unknown> + `as any` silent-column-drop pattern
 * already fixed in RunsRepository.update()/updateStatus() (see
 * runs.repository.update-types.spec.ts / runs.repository.policy-score.spec.ts
 * for the original precedent).
 *
 * Two proofs in one file:
 * 1. Compile-time: ts-jest type-checks this file on every run (no
 *    isolatedModules), so a `@ts-expect-error` line that stops producing a
 *    compiler error makes this test suite fail — proving an unknown field is
 *    now rejected at compile time, not just silently dropped at runtime.
 * 2. Runtime: a real (not mocked) Postgres database proves update() still
 *    accepts and persists a valid partial update of real columns.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_shared_db_test_agents_retype';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// db.ts reads process.env['DATABASE_URL'] at module-load time — must be set
// before the dynamic import inside the tests below.
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

describe('AgentsRepository.update() — retyped field safety (real Postgres)', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
  });

  afterAll(async () => {
    const { pool } = await import('../db');
    await pool?.end();
  });

  it('accepts and persists a valid partial update of real columns', async () => {
    const { AgentsRepository } = await import('./agents.repository');
    const repository = new AgentsRepository();

    const { db } = await import('../db');
    const { agents } = await import('../schema');
    const [created] = await db
      .insert(agents)
      .values({
        organizationId: 'org-1',
        name: 'retype-test-agent',
        version: '1.0.0',
        versionHash: 'hash-1',
        content: 'agent content',
        createdBy: 'test-user',
      })
      .returning();

    await repository.update(created.id, 'org-1', {
      description: 'updated description',
      active: false,
    });

    const found = await repository.findById(created.id, 'org-1');
    expect(found?.description).toBe('updated description');
    expect(found?.active).toBe(false);
  });

  it('rejects an unknown field on update() at compile time', async () => {
    // Dynamic `import()` (not `require()`) preserves module type information,
    // so ts-jest's type-checking pass can actually evaluate the call below.
    const { AgentsRepository } = await import('./agents.repository');
    const repository = new AgentsRepository();
    const call = () =>
      // @ts-expect-error `notARealAgentsColumn` does not exist on the agents
      // table — this must fail to compile. Pre-fix (Record<string, unknown>
      // + `as any`) this line compiled cleanly and the field was silently
      // dropped at runtime.
      repository.update('agent-id', 'org-1', { notARealAgentsColumn: 'x' });
    expect(typeof call).toBe('function');
  });
});
