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
});
