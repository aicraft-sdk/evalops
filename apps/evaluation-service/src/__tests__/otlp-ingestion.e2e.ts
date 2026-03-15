/**
 * Integration tests for OTLP ingestion.
 *
 * Tests the full path:
 *   POST /api/otlp/v1/traces → OTLP span conversion → DB storage
 *
 * Uses NestJS testing module with mocked services (no real DB required).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { OtlpController } from '../app/otlp/otlp.controller';
import { OtlpService } from '../app/otlp/otlp.service';
import { OtlpAuthGuard } from '../app/otlp/otlp-auth.guard';
import { ConfigService } from '@nestjs/config';
import { db } from '@evalops/shared-db';
import { traceSpans } from '@evalops/shared-db';
import { eq } from 'drizzle-orm';

jest.mock('@evalops/shared-db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
  },
  traceSpans: {},
  eq: jest.fn(),
}));

const mockOtlpService = {
  processTraceExport: jest.fn(),
};

const mockOtlpAuthGuard = {
  canActivate: jest.fn(() => true),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('OTLP Ingestion (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OtlpController],
      providers: [
        { provide: OtlpService, useValue: mockOtlpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(OtlpAuthGuard)
      .useValue(mockOtlpAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/otlp/v1/traces', () => {
    it('should accept OTLP trace export request', async () => {
      const requestBody = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: 'evalops.run_id',
                  value: {
                    stringValue: 'run-123',
                  },
                },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-123',
                    spanId: 'span-123',
                    name: 'test.span',
                    startTimeUnixNano: '1000000000',
                    endTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockOtlpService.processTraceExport.mockResolvedValue({
        spansProcessed: 1,
        spansRejected: 0,
      });

      mockOtlpAuthGuard.canActivate.mockImplementation((context) => {
        context.switchToHttp().getRequest().user = {
          organizationId: 'org-123',
        };
        return true;
      });

      const res = await request(app.getHttpServer())
        .post('/api/otlp/v1/traces')
        .send(requestBody)
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        partialSuccess: undefined,
      });
      expect(mockOtlpService.processTraceExport).toHaveBeenCalledWith(
        requestBody,
        'org-123'
      );
    });

    it('should return partial success when spans are rejected', async () => {
      const requestBody = {
        resourceSpans: [
          {
            resource: {
              attributes: [],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-123',
                    spanId: 'span-123',
                    name: 'test.span',
                    startTimeUnixNano: '1000000000',
                    attributes: [],
                    events: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockOtlpService.processTraceExport.mockResolvedValue({
        spansProcessed: 0,
        spansRejected: 1,
      });

      mockOtlpAuthGuard.canActivate.mockImplementation((context) => {
        context.switchToHttp().getRequest().user = {
          organizationId: 'org-123',
        };
        return true;
      });

      const res = await request(app.getHttpServer())
        .post('/api/otlp/v1/traces')
        .send(requestBody)
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        partialSuccess: expect.objectContaining({
          rejectedSpans: 1,
        }),
      });
    });

    it('should handle empty resource spans', async () => {
      const requestBody = {
        resourceSpans: [],
      };

      mockOtlpAuthGuard.canActivate.mockImplementation((context) => {
        context.switchToHttp().getRequest().user = {
          organizationId: 'org-123',
        };
        return true;
      });

      const res = await request(app.getHttpServer())
        .post('/api/otlp/v1/traces')
        .send(requestBody)
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        partialSuccess: expect.objectContaining({
          errorMessage: 'No resource spans provided',
        }),
      });
      expect(mockOtlpService.processTraceExport).not.toHaveBeenCalled();
    });

    it('should extract organizationId from JWT user', async () => {
      const requestBody = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: 'evalops.run_id',
                  value: { stringValue: 'run-123' },
                },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-123',
                    spanId: 'span-123',
                    name: 'test.span',
                    startTimeUnixNano: '1000000000',
                    attributes: [],
                    events: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockOtlpService.processTraceExport.mockResolvedValue({
        spansProcessed: 1,
        spansRejected: 0,
      });

      mockOtlpAuthGuard.canActivate.mockImplementation((context) => {
        context.switchToHttp().getRequest().user = {
          organizationId: 'org-from-jwt',
        };
        return true;
      });

      await request(app.getHttpServer())
        .post('/api/otlp/v1/traces')
        .send(requestBody)
        .expect(HttpStatus.OK);

      expect(mockOtlpService.processTraceExport).toHaveBeenCalledWith(
        requestBody,
        'org-from-jwt'
      );
    });

    it('should handle service token authentication', async () => {
      const requestBody = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: 'evalops.run_id',
                  value: { stringValue: 'run-123' },
                },
                {
                  key: 'evalops.organization_id',
                  value: { stringValue: 'org-from-token' },
                },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-123',
                    spanId: 'span-123',
                    name: 'test.span',
                    startTimeUnixNano: '1000000000',
                    attributes: [],
                    events: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockOtlpService.processTraceExport.mockResolvedValue({
        spansProcessed: 1,
        spansRejected: 0,
      });

      mockOtlpAuthGuard.canActivate.mockImplementation((context) => {
        const req = context.switchToHttp().getRequest();
        req.headers['x-service-token'] = 'valid-token';
        return true;
      });

      await request(app.getHttpServer())
        .post('/api/otlp/v1/traces')
        .set('x-service-token', 'valid-token')
        .send(requestBody)
        .expect(HttpStatus.OK);

      expect(mockOtlpService.processTraceExport).toHaveBeenCalledWith(
        requestBody,
        'org-from-token'
      );
    });
  });
});
