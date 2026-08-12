import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { JudgeCacheRepository } from '@evalops/shared-db';
import { JudgeCacheService } from './judge-cache.service';

// '@evalops/shared-db' is a barrel that loads '../db' at module-load time,
// which throws if DATABASE_URL isn't set (see libs/shared-db/src/lib/db.ts).
// Mock it here since JudgeCacheRepository is only used as a DI token in this
// unit test (matches the pattern in simulations.service.spec.ts).
//
// isUniqueConstraintViolation is pulled in via the real (non-mocked)
// '@evalops/shared-db/dialect-utils' deep import - that file has no
// dependency on '../db', so requiring it for real here exercises the exact
// classification logic judge-cache.service.ts calls in production, instead
// of re-implementing an equivalent check in this test file.
jest.mock('@evalops/shared-db', () => ({
  JudgeCacheRepository: class JudgeCacheRepository {},
  ...jest.requireActual('@evalops/shared-db/dialect-utils'),
}));

describe('JudgeCacheService.getOrCompute', () => {
  let service: JudgeCacheService;
  let repo: { findByCacheKey: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    repo = { findByCacheKey: jest.fn(), create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JudgeCacheService,
        { provide: JudgeCacheRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(JudgeCacheService);
  });

  it('returns the cached result with cost:0 on a hit, without invoking computeFn', async () => {
    repo.findByCacheKey.mockResolvedValue({
      score: 0.9, reasoning: 'cached reason', cost: '0.002',
    });
    const computeFn = jest.fn();

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result).toEqual({ score: 0.9, reasoning: 'cached reason', cost: 0 });
    expect(computeFn).not.toHaveBeenCalled();
  });

  it('calls computeFn and writes to cache on a miss', async () => {
    repo.findByCacheKey.mockResolvedValue(undefined);
    const computeFn = jest.fn().mockResolvedValue({
      score: 0.6, reasoning: 'fresh reason', cost: 0.003,
    });

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ score: 0.6, reasoning: 'fresh reason', cost: 0.003 });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ score: 0.6, reasoning: 'fresh reason', organizationId: 'org-1' }),
    );
  });

  it('fails open: a lookup DB error still calls computeFn and returns its result', async () => {
    repo.findByCacheKey.mockRejectedValue(new Error('connection reset'));
    const computeFn = jest.fn().mockResolvedValue({ score: 0.4, cost: 0.001 });

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(result.score).toBe(0.4);
  });

  it('logs a cache-lookup failure at .error (no benign-race case exists on read, unlike write)', async () => {
    repo.findByCacheKey.mockRejectedValue(new Error('connection reset'));
    const computeFn = jest.fn().mockResolvedValue({ score: 0.4, cost: 0.001 });
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await service.getOrCompute('evaluateFactuality', keyInput(), 'org-1', computeFn);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('fails open: a write DB error does not throw and still returns the live result', async () => {
    repo.findByCacheKey.mockResolvedValue(undefined);
    repo.create.mockRejectedValue(new Error('write failed'));
    const computeFn = jest.fn().mockResolvedValue({ score: 0.7, cost: 0.001 });

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result.score).toBe(0.7);
  });

  it('quietly logs (not warn/error) a unique-violation write race and still returns the live result', async () => {
    repo.findByCacheKey.mockResolvedValue(undefined);
    const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    repo.create.mockRejectedValue(uniqueViolation);
    const computeFn = jest.fn().mockResolvedValue({ score: 0.55, cost: 0.001 });
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result.score).toBe(0.55);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('quietly logs (not warn/error) a REAL better-sqlite3 SQLITE_CONSTRAINT_UNIQUE write race (EVALOPS_DEV_MODE driver) and still returns the live result', async () => {
    // Construct a genuine better-sqlite3 unique-constraint error (not a
    // hand-built {code: 'SQLITE_CONSTRAINT_UNIQUE'} mock object) to prove
    // the benign-race classification actually recognizes what the real
    // dev-mode driver throws, not just an assumption about its shape.
    const Database = require('better-sqlite3');
    const sqliteDb = new Database(':memory:');
    sqliteDb.exec(
      'CREATE TABLE t (id TEXT PRIMARY KEY, cache_key TEXT UNIQUE NOT NULL)',
    );
    sqliteDb
      .prepare('INSERT INTO t (id, cache_key) VALUES (?, ?)')
      .run('1', 'dup');
    let realSqliteUniqueViolation: unknown;
    try {
      sqliteDb
        .prepare('INSERT INTO t (id, cache_key) VALUES (?, ?)')
        .run('2', 'dup');
    } catch (error) {
      realSqliteUniqueViolation = error;
    }
    sqliteDb.close();
    expect((realSqliteUniqueViolation as { code?: string }).code).toBe(
      'SQLITE_CONSTRAINT_UNIQUE',
    );

    repo.findByCacheKey.mockResolvedValue(undefined);
    repo.create.mockRejectedValue(realSqliteUniqueViolation);
    const computeFn = jest.fn().mockResolvedValue({ score: 0.33, cost: 0.001 });
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result.score).toBe(0.33);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs at .error (not .warn) a non-unique-violation write failure, e.g. a generic connection error', async () => {
    repo.findByCacheKey.mockResolvedValue(undefined);
    repo.create.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const computeFn = jest.fn().mockResolvedValue({ score: 0.42, cost: 0.001 });
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result.score).toBe(0.42);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

function keyInput() {
  return {
    sampleId: 's1', output: 'resp', expected: 'exp', contexts: undefined,
    promptFingerprint: 'v1-factuality', model: 'gpt-4', temperature: 0.1,
    maxTokens: 150, seed: 1,
  };
}
