/**
 * Integration tests for the ingestion pipeline.
 *
 * Tests the full path:
 *   POST /api/ingestion/events  → idempotency → DB write
 *   POST /api/ingestion/runs/:id/complete → status update + artifact hashes
 *
 * Uses NestJS testing module with mocked services (no real DB required).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { IngestionController } from '../app/ingestion/ingestion.controller';
import { IngestionService } from '../app/ingestion/ingestion.service';
import { RunsRepository } from '@evalops/shared-db';
import { IdempotencyService } from '../app/ingestion/idempotency.service';
import { TraceEventAdapterService } from '../app/ingestion/trace-event-adapter.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

const mockRunsRepository = {
  appendTraceEvents: jest.fn().mockResolvedValue(undefined),
  updateStatus: jest.fn().mockResolvedValue(undefined),
  updateArtifacts: jest.fn().mockResolvedValue(undefined),
  completeRun: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn().mockResolvedValue({
    id: 'run-123',
    organizationId: 'org-123',
  }),
};

const mockIdempotencyService = {
  isDuplicate: jest.fn().mockResolvedValue(false),
  markSeen: jest.fn().mockResolvedValue(undefined),
};

const mockHttpService = {
  post: jest
    .fn()
    .mockReturnValue(of({ data: { acknowledged: true }, status: 200 })),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      CORE_SERVICE_URL: 'http://localhost:3002',
      SERVICE_SECRET: 'test-secret',
    };
    return config[key] ?? defaultValue;
  }),
};

const mockTraceEventAdapterService = {
  convertAndStore: jest
    .fn()
    .mockResolvedValue({ spansCreated: 0, rootSpanId: '', traceId: '' }),
  convertAndStoreBatch: jest.fn().mockResolvedValue({ spansCreated: 0 }),
};

describe('Ingestion Pipeline (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [
        IngestionService,
        { provide: RunsRepository, useValue: mockRunsRepository },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
        {
          provide: TraceEventAdapterService,
          useValue: mockTraceEventAdapterService,
        },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdempotencyService.isDuplicate.mockResolvedValue(false);
  });

  describe('POST /api/ingestion/events', () => {
    const validEvents = [
      {
        runId: 'run-123',
        type: 'user_message',
        timestamp: new Date().toISOString(),
        data: { content: 'hello' },
      },
      {
        runId: 'run-123',
        type: 'assistant_message',
        timestamp: new Date().toISOString(),
        data: { content: 'world' },
      },
    ];

    it('accepts a valid batch of events and returns 202', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ingestion/events')
        .send({ events: validEvents })
        .expect(HttpStatus.ACCEPTED);

      expect(res.body.success).toBe(true);
      expect(res.body.skipped).toBeUndefined();
      expect(mockRunsRepository.appendTraceEvents).toHaveBeenCalledWith(
        'run-123',
        validEvents
      );
    });

    it('skips duplicate requests when idempotency key is present', async () => {
      mockIdempotencyService.isDuplicate.mockResolvedValueOnce(true);

      const res = await request(app.getHttpServer())
        .post('/api/ingestion/events')
        .set('idempotency-key', 'key-abc')
        .send({ events: validEvents })
        .expect(HttpStatus.ACCEPTED);

      expect(res.body.success).toBe(true);
      expect(res.body.skipped).toBe(true);
      expect(mockRunsRepository.appendTraceEvents).not.toHaveBeenCalled();
    });

    it('marks idempotency key as seen after processing', async () => {
      await request(app.getHttpServer())
        .post('/api/ingestion/events')
        .set('idempotency-key', 'key-xyz')
        .send({ events: validEvents })
        .expect(HttpStatus.ACCEPTED);

      expect(mockIdempotencyService.markSeen).toHaveBeenCalledWith('key-xyz');
    });

    it('groups events by runId and persists each run separately', async () => {
      const multiRunEvents = [
        {
          runId: 'run-A',
          type: 'user_message',
          timestamp: new Date().toISOString(),
          data: {},
        },
        {
          runId: 'run-B',
          type: 'user_message',
          timestamp: new Date().toISOString(),
          data: {},
        },
        {
          runId: 'run-A',
          type: 'assistant_message',
          timestamp: new Date().toISOString(),
          data: {},
        },
      ];

      await request(app.getHttpServer())
        .post('/api/ingestion/events')
        .send({ events: multiRunEvents })
        .expect(HttpStatus.ACCEPTED);

      expect(mockRunsRepository.appendTraceEvents).toHaveBeenCalledTimes(2);
      const calls = mockRunsRepository.appendTraceEvents.mock.calls;
      const runIds = calls.map((c: unknown[]) => c[0]);
      expect(runIds).toContain('run-A');
      expect(runIds).toContain('run-B');
    });
  });

  describe('POST /api/ingestion/runs/:id/complete', () => {
    const runId = 'run-complete-123';
    const artifactHashes = {
      'output.json': 'sha256-abc123',
      'trace.jsonl': 'sha256-def456',
    };

    it('marks run as completed and stores artifact hashes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/ingestion/runs/${runId}/complete`)
        .send({ artifactHashes })
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(mockRunsRepository.completeRun).toHaveBeenCalledWith(
        runId,
        artifactHashes
      );
    });

    it('triggers integration-service notification (fire-and-forget)', async () => {
      await request(app.getHttpServer())
        .post(`/api/ingestion/runs/${runId}/complete`)
        .send({ artifactHashes })
        .expect(HttpStatus.OK);

      // Give fire-and-forget a tick to run
      await new Promise((r) => setTimeout(r, 10));

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining(`/api/artifacts/${runId}/notify`),
        { artifactHashes },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Service-Token': 'test-secret',
          }),
        })
      );
    });

    it('completes successfully even if integration-service notification fails', async () => {
      mockHttpService.post.mockReturnValueOnce(
        throwError(() => new Error('network error'))
      );

      const res = await request(app.getHttpServer())
        .post(`/api/ingestion/runs/${runId}/complete`)
        .send({ artifactHashes })
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
    });

    it('handles empty artifact hashes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/ingestion/runs/${runId}/complete`)
        .send({ artifactHashes: {} })
        .expect(HttpStatus.OK);

      expect(res.body.success).toBe(true);
      expect(mockRunsRepository.completeRun).toHaveBeenCalledWith(runId, {});
    });
  });
});
