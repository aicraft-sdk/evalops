/**
 * e2e-style Nest test for GoldenSetsController: real HTTP pipeline (real
 * ValidationPipe per-route, real JwtAuthGuard class overridden with a fake
 * canActivate that attaches req.user — golden_sets/calibration_runs are
 * Postgres-only tables not mirrored in EVALOPS_DEV_MODE SQLite, see
 * project memory, so GoldenSetsService/CalibrationService are mocked here
 * rather than exercising a real DB), asserting:
 *  - ValidationPipe genuinely rejects malformed bodies (400) and accepts
 *    valid ones (Task 6.1)
 *  - organizationId/createdBy come from the authenticated user
 *    (@CurrentUser()), never from the client body (Security Requirements)
 */
import { Test } from '@nestjs/testing';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

// golden_sets/calibration_runs are Postgres-only tables (not mirrored in
// EVALOPS_DEV_MODE SQLite, see project memory) — '@evalops/shared-db' is
// mocked so importing golden-sets.service.ts (transitively, via
// golden-sets.controller.ts) does not trigger a real DB connection. Mirrors
// calibration.service.spec.ts's exact pattern.
jest.mock('@evalops/shared-db', () => ({
  GoldenSetsRepository: class GoldenSetsRepository {},
}));

import { JwtAuthGuard, AuthenticatedUser } from '@evalops/shared-auth';
import { GoldenSetsController } from './golden-sets.controller';
import { GoldenSetsService } from './golden-sets.service';
import { CalibrationService } from '../evaluation/calibration/calibration.service';

const currentUser: AuthenticatedUser = {
  id: 'user-1',
  email: 'user1@example.com',
  organizationId: 'org-1',
};

describe('GoldenSetsController (e2e-style, mocked services)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let goldenSetsService: {
    list: jest.Mock;
    create: jest.Mock;
    listExamples: jest.Mock;
    addExample: jest.Mock;
    listCalibrationRuns: jest.Mock;
    verifyGoldenSetOwnership: jest.Mock;
  };
  let calibrationService: { runCalibration: jest.Mock };

  beforeEach(async () => {
    goldenSetsService = {
      list: jest.fn(),
      create: jest.fn(),
      listExamples: jest.fn(),
      addExample: jest.fn(),
      listCalibrationRuns: jest.fn(),
      verifyGoldenSetOwnership: jest.fn().mockResolvedValue(undefined),
    };
    calibrationService = { runCalibration: jest.fn() };

    moduleRef = await Test.createTestingModule({
      controllers: [GoldenSetsController],
      providers: [
        { provide: GoldenSetsService, useValue: goldenSetsService },
        { provide: CalibrationService, useValue: calibrationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /golden-sets', () => {
    it('rejects a body missing the required name field (400)', async () => {
      await request(app.getHttpServer()).post('/golden-sets').send({}).expect(400);
      expect(goldenSetsService.create).not.toHaveBeenCalled();
    });

    it('rejects a body with a client-supplied organizationId (403-adjacent: 400 forbidNonWhitelisted, proves org cannot be injected via body)', async () => {
      await request(app.getHttpServer())
        .post('/golden-sets')
        .send({ name: 'GS', organizationId: 'attacker-org' })
        .expect(400);
      expect(goldenSetsService.create).not.toHaveBeenCalled();
    });

    it('accepts a valid body (201) and derives organizationId/createdBy from the authenticated user', async () => {
      goldenSetsService.create.mockResolvedValue({
        id: 'gs1',
        name: 'Factuality Set',
        description: null,
        organizationId: currentUser.organizationId,
        createdBy: currentUser.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const res = await request(app.getHttpServer())
        .post('/golden-sets')
        .send({ name: 'Factuality Set' })
        .expect(201);

      expect(res.body.id).toBe('gs1');
      expect(goldenSetsService.create).toHaveBeenCalledWith(
        { name: 'Factuality Set' },
        currentUser.organizationId,
        currentUser.id,
      );
    });
  });

  describe('GET /golden-sets', () => {
    it('lists golden sets scoped to the authenticated user organization', async () => {
      goldenSetsService.list.mockResolvedValue([{ id: 'gs1', name: 'GS' }]);

      const res = await request(app.getHttpServer()).get('/golden-sets').expect(200);

      expect(res.body).toEqual([{ id: 'gs1', name: 'GS' }]);
      expect(goldenSetsService.list).toHaveBeenCalledWith(currentUser.organizationId);
    });
  });

  describe('POST /golden-sets/:id/examples', () => {
    it('rejects a body missing the required humanLabel field (400)', async () => {
      await request(app.getHttpServer())
        .post('/golden-sets/gs1/examples')
        .send({ output: 'the answer' })
        .expect(400);
      expect(goldenSetsService.addExample).not.toHaveBeenCalled();
    });

    it('rejects a non-array context field (400)', async () => {
      await request(app.getHttpServer())
        .post('/golden-sets/gs1/examples')
        .send({ output: 'the answer', humanLabel: true, context: 'not-an-array' })
        .expect(400);
      expect(goldenSetsService.addExample).not.toHaveBeenCalled();
    });

    it('rejects a context array with non-string elements (400)', async () => {
      await request(app.getHttpServer())
        .post('/golden-sets/gs1/examples')
        .send({ output: 'the answer', humanLabel: true, context: [1, 2, 3] })
        .expect(400);
      expect(goldenSetsService.addExample).not.toHaveBeenCalled();
    });

    it('accepts a valid body (201)', async () => {
      goldenSetsService.addExample.mockResolvedValue({
        id: 'ex1',
        goldenSetId: 'gs1',
        output: 'the answer',
        humanLabel: true,
      });

      const res = await request(app.getHttpServer())
        .post('/golden-sets/gs1/examples')
        .send({ output: 'the answer', humanLabel: true })
        .expect(201);

      expect(res.body.id).toBe('ex1');
      expect(goldenSetsService.addExample).toHaveBeenCalledWith(
        'gs1',
        { output: 'the answer', humanLabel: true },
        currentUser.organizationId,
        currentUser.id,
      );
    });

    it('accepts a string input value (201) - matches the Add Example form, which always sends input as a plain string', async () => {
      goldenSetsService.addExample.mockResolvedValue({
        id: 'ex2',
        goldenSetId: 'gs1',
        input: 'what is the capital of France?',
        output: 'the answer',
        humanLabel: true,
      });

      const res = await request(app.getHttpServer())
        .post('/golden-sets/gs1/examples')
        .send({
          input: 'what is the capital of France?',
          output: 'the answer',
          humanLabel: true,
        })
        .expect(201);

      expect(res.body.id).toBe('ex2');
      expect(goldenSetsService.addExample).toHaveBeenCalledWith(
        'gs1',
        {
          input: 'what is the capital of France?',
          output: 'the answer',
          humanLabel: true,
        },
        currentUser.organizationId,
        currentUser.id,
      );
    });
  });

  describe('GET /golden-sets/:id/examples', () => {
    it('lists examples for a golden set', async () => {
      goldenSetsService.listExamples.mockResolvedValue([{ id: 'ex1' }]);

      const res = await request(app.getHttpServer())
        .get('/golden-sets/gs1/examples')
        .expect(200);

      expect(res.body).toEqual([{ id: 'ex1' }]);
      expect(goldenSetsService.listExamples).toHaveBeenCalledWith(
        'gs1',
        currentUser.organizationId,
      );
    });
  });

  describe('POST /golden-sets/:id/calibration-runs', () => {
    it('rejects a body missing the required judgeEvaluator field (400)', async () => {
      await request(app.getHttpServer())
        .post('/golden-sets/gs1/calibration-runs')
        .send({})
        .expect(400);
      expect(calibrationService.runCalibration).not.toHaveBeenCalled();
    });

    it('rejects a judgeThreshold outside [0, 1] (400)', async () => {
      await request(app.getHttpServer())
        .post('/golden-sets/gs1/calibration-runs')
        .send({ judgeEvaluator: 'llm_as_judge', judgeThreshold: 1.5 })
        .expect(400);
      expect(calibrationService.runCalibration).not.toHaveBeenCalled();
    });

    it('verifies golden-set ownership before delegating to CalibrationService (404 when ownership check throws)', async () => {
      goldenSetsService.verifyGoldenSetOwnership.mockRejectedValue(
        new (require('@nestjs/common').NotFoundException)('Golden set gs1 not found'),
      );

      await request(app.getHttpServer())
        .post('/golden-sets/gs1/calibration-runs')
        .send({ judgeEvaluator: 'llm_as_judge' })
        .expect(404);

      expect(calibrationService.runCalibration).not.toHaveBeenCalled();
    });

    it('accepts a valid body (201), verifies ownership first, then delegates to CalibrationService with organizationId/triggeredBy from the authenticated user', async () => {
      calibrationService.runCalibration.mockResolvedValue({
        id: 'run1',
        goldenSetId: 'gs1',
        judgeEvaluator: 'llm_as_judge',
        judgeConfig: {},
        judgeThreshold: 0.5,
        agreementRate: 0.9,
        kappa: 0.85,
        isCalibrated: true,
        isReliable: true,
        sampleCount: 5,
        disagreements: { items: [], excludedCount: 0, excludedExamples: [] },
        organizationId: currentUser.organizationId,
        triggeredBy: currentUser.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const res = await request(app.getHttpServer())
        .post('/golden-sets/gs1/calibration-runs')
        .send({ judgeEvaluator: 'llm_as_judge' })
        .expect(201);

      expect(res.body.id).toBe('run1');
      expect(goldenSetsService.verifyGoldenSetOwnership).toHaveBeenCalledWith(
        'gs1',
        currentUser.organizationId,
      );
      expect(calibrationService.runCalibration).toHaveBeenCalledWith({
        goldenSetId: 'gs1',
        judgeEvaluator: 'llm_as_judge',
        judgeConfig: undefined,
        judgeThreshold: undefined,
        organizationId: currentUser.organizationId,
        triggeredBy: currentUser.id,
      });
    });
  });

  describe('GET /golden-sets/:id/calibration-runs', () => {
    it('lists calibration runs for a golden set', async () => {
      goldenSetsService.listCalibrationRuns.mockResolvedValue([{ id: 'run1' }]);

      const res = await request(app.getHttpServer())
        .get('/golden-sets/gs1/calibration-runs')
        .expect(200);

      expect(res.body).toEqual([{ id: 'run1' }]);
      expect(goldenSetsService.listCalibrationRuns).toHaveBeenCalledWith(
        'gs1',
        currentUser.organizationId,
      );
    });
  });
});
