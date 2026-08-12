/**
 * CalibrationService + real-Postgres integration test (NOT a full end-to-end
 * test — see calibration.http-e2e.spec.ts in this same directory for that).
 * Proves the full golden-set calibration flow at the service layer:
 * createGoldenSet -> addExample (multiple, including a bad example) ->
 * runCalibration -> a calibration_runs row is actually persisted with the
 * correct shape.
 *
 * Purity boundary: DB access is real (GoldenSetsRepository talks to a real,
 * throwaway, migration-replayed Postgres database exactly like
 * golden-sets.repository.spec.ts). This test mocks EvaluatorsService itself
 * — one layer above the real outbound AI-provider boundary — so it does NOT
 * exercise JudgeCacheService, AIProviderService, JwtAuthGuard, or
 * GoldenSetsController; those are only exercised by
 * calibration.http-e2e.spec.ts, which boots the real NestJS module graph
 * (real HTTP via supertest, real JwtAuthGuard verifying a real signed JWT,
 * real GoldenSetsController/GoldenSetsService/CalibrationService/
 * EvaluatorsService/EvaluatorsLLMService/JudgeCacheService) and mocks only
 * AIProviderService.generateResponse — the genuine external boundary. THIS
 * file remains valuable and fast as a CalibrationService-focused regression
 * test; calibration.http-e2e.spec.ts is the genuine end-to-end complement.
 * This test exercises the REAL CalibrationService/computeCohensKappa logic
 * (11 remediation cycles fixed swallowed-failure exclusion, class-diversity
 * guards, and fabricated-default exclusion bugs in this exact service — see
 * calibration.service.ts's own comments) — not a simplified stand-in.
 *
 * This test spins up a throwaway database and replays every *.sql file under
 * libs/shared-db/migrations/ (in order) before each run, mirroring
 * golden-sets.repository.spec.ts's harness verbatim (new TEST_DB_NAME).
 *
 * DATABASE_URL must be set to a real reachable Postgres server via this
 * file's module-scope assignment below, BEFORE any dynamic import of
 * '@evalops/shared-db' or './calibration.service' (both transitively import
 * '../db', which reads DATABASE_URL at module-load time) — matching this
 * repo's established real-Postgres integration-test pattern exactly.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import type { EvaluatorsService } from '../evaluators/evaluators.service';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_calibration_e2e_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// db.ts reads process.env['DATABASE_URL'] at module-load time — must be set
// before any dynamic import below.
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
        // node-postgres's simple query protocol runs multi-statement strings
        // fine as long as no parameters are used (true for all DDL here).
        await target.query(sqlText);
      }
    }
  } finally {
    await target.end();
  }
}

/**
 * Mocked outbound AI-provider boundary: keyed by the example's `output` text
 * (the first positional arg CalibrationService.scoreExample passes to
 * evaluateFactuality), not by call order — GoldenSetsRepository.listExamples
 * has no ORDER BY, so row order is not guaranteed and must not be relied on.
 */
function buildMockEvaluators(scoreMap: Record<string, { score: number; reasoning: string }>) {
  const notUsed = () => {
    throw new Error('Unexpected evaluator method invoked in this test');
  };
  return {
    evaluateLLMAsJudge: jest.fn(notUsed),
    evaluateBattle: jest.fn(notUsed),
    evaluateFactuality: jest.fn(async (response: string) => {
      const entry = scoreMap[response];
      if (!entry) {
        throw new Error(`Unexpected evaluateFactuality response text: ${response}`);
      }
      return { score: entry.score, cost: 0.001, reasoning: entry.reasoning };
    }),
    evaluateSecurity: jest.fn(notUsed),
    evaluateAnswerRelevancy: jest.fn(notUsed),
    evaluateContextPrecision: jest.fn(notUsed),
    evaluateContextRecall: jest.fn(notUsed),
    evaluateContextRelevancy: jest.fn(notUsed),
    evaluateFaithfulness: jest.fn(notUsed),
    evaluateAnswerCorrectness: jest.fn(notUsed),
    evaluatePIIDetection: jest.fn(notUsed),
    evaluateJailbreakDetection: jest.fn(notUsed),
  };
}

describe('Golden-set calibration end-to-end flow (real Postgres)', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
  });

  afterAll(async () => {
    // Close the shared connection pool opened by '@evalops/shared-db' (its
    // db.ts module) so jest workers exit cleanly instead of being
    // force-killed on an open handle.
    const { pool } = await import('@evalops/shared-db');
    await pool?.end();
  });

  it('createGoldenSet -> addExample (x5, incl. 1 bad) -> runCalibration persists a calibration_runs row with the correct shape', async () => {
    const { GoldenSetsRepository } = await import('@evalops/shared-db');
    const { CalibrationService } = await import('./calibration.service');

    const goldenSetsRepo = new GoldenSetsRepository();

    const scoreMap: Record<string, { score: number; reasoning: string }> = {
      'Output for example 1': { score: 0.9, reasoning: 'Accurate and complete' },
      'Output for example 2 (bad)': { score: 0.9, reasoning: 'Judge missed the factual flaw' },
      'Output for example 3': { score: 0.8, reasoning: 'Mostly accurate' },
      'Output for example 4': { score: 0.2, reasoning: 'Inaccurate response' },
      'Output for example 5': { score: 0.6, reasoning: 'Reasonably accurate' },
    };
    const mockEvaluators = buildMockEvaluators(scoreMap);
    const calibrationService = new CalibrationService(
      goldenSetsRepo,
      mockEvaluators as unknown as EvaluatorsService,
    );

    const goldenSet = await goldenSetsRepo.createGoldenSet({
      name: 'Calibration E2E Golden Set',
      organizationId: 'org-e2e-1',
      createdBy: 'user-e2e-1',
    });

    const created = await Promise.all([
      goldenSetsRepo.addExample({
        goldenSetId: goldenSet.id,
        output: 'Output for example 1',
        humanLabel: true,
        isBadExample: false,
        createdBy: 'user-e2e-1',
        organizationId: 'org-e2e-1',
      }),
      goldenSetsRepo.addExample({
        goldenSetId: goldenSet.id,
        output: 'Output for example 2 (bad)',
        humanLabel: false,
        isBadExample: true,
        createdBy: 'user-e2e-1',
        organizationId: 'org-e2e-1',
      }),
      goldenSetsRepo.addExample({
        goldenSetId: goldenSet.id,
        output: 'Output for example 3',
        humanLabel: true,
        isBadExample: false,
        createdBy: 'user-e2e-1',
        organizationId: 'org-e2e-1',
      }),
      goldenSetsRepo.addExample({
        goldenSetId: goldenSet.id,
        output: 'Output for example 4',
        humanLabel: false,
        isBadExample: false,
        createdBy: 'user-e2e-1',
        organizationId: 'org-e2e-1',
      }),
      goldenSetsRepo.addExample({
        goldenSetId: goldenSet.id,
        output: 'Output for example 5',
        humanLabel: true,
        isBadExample: false,
        createdBy: 'user-e2e-1',
        organizationId: 'org-e2e-1',
      }),
    ]);
    expect(created).toHaveLength(5);
    expect(created.filter((e) => e.isBadExample)).toHaveLength(1);

    const run = await calibrationService.runCalibration({
      goldenSetId: goldenSet.id,
      judgeEvaluator: 'factuality',
      organizationId: 'org-e2e-1',
      triggeredBy: 'user-e2e-1',
    });

    // Assert the shape/content the caller (service return value) sees...
    expect(run.goldenSetId).toBe(goldenSet.id);
    expect(run.sampleCount).toBe(5);
    expect(typeof run.kappa).toBe('number');
    expect(run.kappa).not.toBeNull();
    // Hand-computed from the fixture above: n=5, agree=4 (e1,e3,e4,e5 agree;
    // e2 disagrees) -> agreementRate=0.8. humanTrue=3, humanFalse=2;
    // judgeTrue=4 (e1,e2,e3,e5 score>=0.5), judgeFalse=1 (e4).
    // pe = (3*4 + 2*1) / 25 = 14/25 = 0.56; kappa = (0.8-0.56)/(1-0.56) = 0.5454545...
    expect(run.kappa).toBeCloseTo((0.8 - 0.56) / (1 - 0.56), 5);
    expect(run.isReliable).toBe(true);
    expect(run.agreementRate).toBeCloseTo(0.8, 5);
    const disagreements = run.disagreements as {
      items: Array<{
        exampleId: string;
        humanLabel: boolean;
        judgeLabel: boolean;
        judgeScore: number;
        judgeReasoning?: string;
      }>;
      excludedCount: number;
      excludedExamples: unknown[];
    };
    expect(disagreements.excludedCount).toBe(0);
    expect(disagreements.excludedExamples).toEqual([]);
    expect(disagreements.items).toHaveLength(1);
    expect(disagreements.items[0]).toMatchObject({
      humanLabel: false,
      judgeLabel: true,
      judgeScore: 0.9,
      judgeReasoning: 'Judge missed the factual flaw',
    });
    // ...AND independently re-read it back from a fresh repository call, to
    // prove the row is genuinely persisted, not just fabricated in the
    // in-memory return value (this exact class of bug has recurred 11 times
    // across this plan's remediation history).
    const persistedRuns = await goldenSetsRepo.listCalibrationRuns(goldenSet.id);
    expect(persistedRuns).toHaveLength(1);
    expect(persistedRuns[0].id).toBe(run.id);
    expect(persistedRuns[0].sampleCount).toBe(5);
    expect(persistedRuns[0].kappa).toBeCloseTo(run.kappa as number, 10);
    expect(persistedRuns[0].isReliable).toBe(true);
  });

  it('rejects a calibration run against a golden set with zero bad examples, and persists nothing', async () => {
    const { GoldenSetsRepository } = await import('@evalops/shared-db');
    const { CalibrationService } = await import('./calibration.service');

    const goldenSetsRepo = new GoldenSetsRepository();
    const mockEvaluators = buildMockEvaluators({});
    const calibrationService = new CalibrationService(
      goldenSetsRepo,
      mockEvaluators as unknown as EvaluatorsService,
    );

    const goldenSet = await goldenSetsRepo.createGoldenSet({
      name: 'No Bad Examples Golden Set',
      organizationId: 'org-e2e-2',
      createdBy: 'user-e2e-2',
    });
    await goldenSetsRepo.addExample({
      goldenSetId: goldenSet.id,
      output: 'Only a good example',
      humanLabel: true,
      isBadExample: false,
      createdBy: 'user-e2e-2',
      organizationId: 'org-e2e-2',
    });

    await expect(
      calibrationService.runCalibration({
        goldenSetId: goldenSet.id,
        judgeEvaluator: 'factuality',
        organizationId: 'org-e2e-2',
        triggeredBy: 'user-e2e-2',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockEvaluators.evaluateFactuality).not.toHaveBeenCalled();
    const persistedRuns = await goldenSetsRepo.listCalibrationRuns(goldenSet.id);
    expect(persistedRuns).toEqual([]);
  });
});
