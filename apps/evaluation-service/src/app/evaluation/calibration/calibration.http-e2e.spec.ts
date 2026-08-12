/**
 * Genuine end-to-end HTTP integration test proving the FULL stack actually
 * integrates: real HTTP (supertest) -> real JwtAuthGuard verifying a real
 * signed JWT (not an overridden/stubbed guard) -> real GoldenSetsController
 * -> real GoldenSetsService.verifyGoldenSetOwnership (cross-tenant IDOR
 * guard) -> real CalibrationService -> real EvaluatorsService /
 * EvaluatorsLLMService -> real JudgeCacheService.getOrCompute, all backed by
 * a real, throwaway, migration-replayed Postgres database. Only the
 * outbound AI-provider network boundary is mocked
 * (AIProviderService.generateResponse), matching this repo's established
 * purity boundary (see policies.integration.test.ts and
 * calibration.e2e.spec.ts).
 *
 * `calibration.e2e.spec.ts` (same directory) is a real CalibrationService +
 * real-Postgres integration test (valuable and fast, but not full
 * end-to-end) -- it mocks `EvaluatorsService` itself, one layer above the
 * real AI-provider boundary, so it never exercises `JudgeCacheService`,
 * `AIProviderService`, `JwtAuthGuard`, or `GoldenSetsController`. THIS file
 * is the genuine end-to-end complement that does.
 *
 * The NestJS module graph booted here is a real subset of the production
 * AppModule (`apps/evaluation-service/src/app/app.module.ts`):
 * `ConfigModule.forRoot`, `PassportModule`, `SharedDbModule`, and the real
 * `GoldenSetsModule` (which itself imports the real `EvaluatorsModule` ->
 * `AIProviderModule`) -- not a hand-assembled provider list. `JwtStrategy`
 * is the real evaluation-service strategy, added the same way
 * `AppModule` does (a root-level provider, not a guard override).
 *
 * DATABASE_URL must be set to a real reachable Postgres server via this
 * file's module-scope assignment below, BEFORE any require() of
 * '@evalops/shared-db' or any module that transitively imports it
 * (db.ts reads DATABASE_URL at module-load time and eagerly opens a Pool).
 * `GoldenSetsModule` and `@evalops/shared-db` are therefore loaded via
 * CommonJS require() calls placed textually AFTER the DATABASE_URL
 * assignment (ES `import` statements are hoisted above this file's
 * top-level statements and would load against the wrong/unset
 * DATABASE_URL) -- mirrors calibration.e2e.spec.ts's dynamic-import
 * pattern and admin-rbac.e2e.spec.ts's require()-after-env-setup pattern
 * exactly. Everything else here (AIProviderService, JwtStrategy,
 * @nestjs/* packages, pg, supertest) does not transitively import
 * '@evalops/shared-db', so those use normal top-level `import`.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { HttpStatus } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AIProviderService } from '../../ai-provider/ai-provider.service';
import { JwtStrategy } from '../../auth/jwt.strategy';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_calibration_http_e2e_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const TEST_JWT_SECRET = 'test-secret-for-calibration-http-e2e-tests-only';

// db.ts reads process.env['DATABASE_URL'] at module-load time -- must be set
// before the require() calls below. JwtStrategy's constructor reads
// JWT_SECRET at Nest DI instantiation time (inside beforeAll), well after
// this assignment, so plain top-level assignment is sufficient for it.
process.env['DATABASE_URL'] = TEST_DATABASE_URL;
process.env['JWT_SECRET'] = TEST_JWT_SECRET;
// AIProviderService's constructor eagerly builds a real OpenAI client and
// throws if no API key is configured. The key is never actually used --
// generateResponse() is spied/mocked below before any test makes a request.
process.env['OPENAI_API_KEY'] = 'test-key-not-used-generateResponse-is-mocked';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GoldenSetsModule } = require('../../golden-sets/golden-sets.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SharedDbModule, pool } = require('@evalops/shared-db');

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
    const migrationsDir = join(__dirname, '../../../../../../libs/shared-db/migrations');
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

function mintToken(payload: { sub: string; email: string; organizationId: string }): string {
  const jwtService = new JwtService({ secret: TEST_JWT_SECRET });
  return jwtService.sign({ ...payload, roles: [] });
}

/** Keyed by the exact `output` text embedded in evaluateFactuality's prompt template. */
const CACHE_TEST_SCORES: Record<string, number> = {
  'Cache test output 1': 85,
  'Cache test output 2 (bad)': 20,
  'Cache test output 3': 75,
  'Cache test output 4': 15,
  'Cache test output 5': 65,
};

function mockFactualityResponse(prompt: string) {
  const matched = Object.keys(CACHE_TEST_SCORES).find((output) =>
    prompt.includes(`Response: "${output}"`),
  );
  if (!matched) {
    throw new Error(`Unexpected prompt sent to mocked AIProviderService.generateResponse: ${prompt}`);
  }
  return {
    response: JSON.stringify({ score: CACHE_TEST_SCORES[matched], reason: `Judged: ${matched}` }),
    cost: 0.001,
    tokenUsage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 },
  };
}

describe('Golden-set calibration HTTP end-to-end (real Postgres, real JwtAuthGuard, mocked AI provider)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let moduleRef: TestingModule;
  let generateResponseSpy: jest.SpyInstance;

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule,
        SharedDbModule,
        GoldenSetsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // "Override the provider" surgically: keep the real AIProviderService
    // instance (so getDefaultModel() -- read by every judge method to build
    // the cache key -- stays genuinely real), and mock ONLY the outbound
    // generateResponse() network call.
    const aiProviderService = moduleRef.get(AIProviderService, { strict: false });
    generateResponseSpy = jest.spyOn(aiProviderService, 'generateResponse');
  });

  afterAll(async () => {
    await app.close();
    await pool?.end();
  });

  it('caches judge results across two full runCalibration HTTP calls for the same golden set (proves JudgeCacheService.getOrCompute cache-hits through the real HTTP path)', async () => {
    generateResponseSpy.mockImplementation(async (prompt: string) => mockFactualityResponse(prompt));

    const token = mintToken({
      sub: 'user-cache-1',
      email: 'cache1@org-cache.test',
      organizationId: 'org-cache-1',
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/golden-sets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cache Test Golden Set' })
      .expect(HttpStatus.CREATED);
    const goldenSetId: string = createRes.body.id;
    expect(typeof goldenSetId).toBe('string');
    expect(goldenSetId.length).toBeGreaterThan(0);

    // 5 examples, incl. >=1 isBadExample, all judge-vs-human agreeing (kept
    // simple -- this test proves caching, not calibration accuracy).
    const examples = [
      { output: 'Cache test output 1', humanLabel: true, isBadExample: false },
      { output: 'Cache test output 2 (bad)', humanLabel: false, isBadExample: true },
      { output: 'Cache test output 3', humanLabel: true, isBadExample: false },
      { output: 'Cache test output 4', humanLabel: false, isBadExample: false },
      { output: 'Cache test output 5', humanLabel: true, isBadExample: false },
    ];
    for (const example of examples) {
      await request(app.getHttpServer())
        .post(`/api/golden-sets/${goldenSetId}/examples`)
        .set('Authorization', `Bearer ${token}`)
        .send(example)
        .expect(HttpStatus.CREATED);
    }

    const run1Res = await request(app.getHttpServer())
      .post(`/api/golden-sets/${goldenSetId}/calibration-runs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ judgeEvaluator: 'factuality' })
      .expect(HttpStatus.CREATED);

    expect(run1Res.body).toMatchObject({
      goldenSetId,
      sampleCount: 5,
      isReliable: true,
    });
    expect(run1Res.body.kappa).toBeCloseTo(1, 5);

    const callCountAfterRun1 = generateResponseSpy.mock.calls.length;
    // One live AI-provider call per distinct example on the first (cold) run.
    expect(callCountAfterRun1).toBe(5);

    const run2Res = await request(app.getHttpServer())
      .post(`/api/golden-sets/${goldenSetId}/calibration-runs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ judgeEvaluator: 'factuality' })
      .expect(HttpStatus.CREATED);

    const callCountAfterRun2 = generateResponseSpy.mock.calls.length;
    // The headline claim: rerunning against the identical golden set/examples
    // does NOT grow the mocked AIProviderService.generateResponse call count
    // -- every one of the 5 judge dispatches hit judge_cache through the
    // real HTTP -> controller -> service -> cache-aware evaluator path.
    expect(callCountAfterRun2).toBe(callCountAfterRun1);

    expect(run2Res.body).toMatchObject({
      goldenSetId,
      sampleCount: 5,
      isReliable: true,
    });
    expect(run2Res.body.kappa).toBeCloseTo(1, 5);
    // Two genuinely distinct persisted calibration_runs rows, not a
    // duplicate/no-op response.
    expect(run2Res.body.id).not.toBe(run1Res.body.id);

    const listRes = await request(app.getHttpServer())
      .get(`/api/golden-sets/${goldenSetId}/calibration-runs`)
      .set('Authorization', `Bearer ${token}`)
      .expect(HttpStatus.OK);
    expect(listRes.body).toHaveLength(2);
    const persistedIds = listRes.body.map((r: { id: string }) => r.id).sort();
    expect(persistedIds).toEqual([run1Res.body.id, run2Res.body.id].sort());
  });

  it('blocks cross-tenant access to another organization’s golden set with 404 (proves JwtAuthGuard + verifyGoldenSetOwnership are really wired end-to-end, not just unit-tested)', async () => {
    const callCountBefore = generateResponseSpy.mock.calls.length;
    generateResponseSpy.mockImplementation(async () => {
      throw new Error('generateResponse must not be called for a cross-tenant-rejected request');
    });

    const tokenOrgA = mintToken({
      sub: 'user-org-a',
      email: 'admin@org-a.test',
      organizationId: 'org-tenant-a',
    });
    const tokenOrgB = mintToken({
      sub: 'user-org-b',
      email: 'admin@org-b.test',
      organizationId: 'org-tenant-b',
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/golden-sets')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({ name: 'Org A Private Golden Set' })
      .expect(HttpStatus.CREATED);
    const goldenSetId: string = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/golden-sets/${goldenSetId}/examples`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({ output: 'Org A secret output', humanLabel: true, isBadExample: true })
      .expect(HttpStatus.CREATED);

    // No Authorization header at all -> real JwtAuthGuard/passport-jwt
    // rejects unauthenticated access before any controller code runs.
    await request(app.getHttpServer())
      .get(`/api/golden-sets/${goldenSetId}/examples`)
      .expect(HttpStatus.UNAUTHORIZED);

    // Authenticated as a DIFFERENT organization -> real
    // GoldenSetsService.verifyGoldenSetOwnership/getOwnedGoldenSet rejects.
    const examplesResB = await request(app.getHttpServer())
      .get(`/api/golden-sets/${goldenSetId}/examples`)
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .expect(HttpStatus.NOT_FOUND);
    expect(examplesResB.body.message).toContain(goldenSetId);

    const calibrationResB = await request(app.getHttpServer())
      .post(`/api/golden-sets/${goldenSetId}/calibration-runs`)
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .send({ judgeEvaluator: 'factuality' })
      .expect(HttpStatus.NOT_FOUND);
    expect(calibrationResB.body.message).toContain(goldenSetId);

    // Ownership was checked BEFORE any judge dispatch -- no AI-provider call
    // (and thus no org-A data ever reached CalibrationService) leaked out.
    expect(generateResponseSpy.mock.calls.length).toBe(callCountBefore);

    // Positive control: org A can still reach its own golden set through the
    // exact same real guard + ownership-check path.
    const examplesResA = await request(app.getHttpServer())
      .get(`/api/golden-sets/${goldenSetId}/examples`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .expect(HttpStatus.OK);
    expect(examplesResA.body).toHaveLength(1);
    expect(examplesResA.body[0].output).toBe('Org A secret output');
  });
});
