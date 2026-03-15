import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OtlpService } from './otlp.service';
import { db } from '@evalops/shared-db';
import { traceSpans } from '@evalops/shared-db';
import { eq } from 'drizzle-orm';
import type { OtlpExportTraceServiceRequest } from './otlp.dto';

jest.mock('@evalops/shared-db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
  },
  traceSpans: {},
  eq: jest.fn(),
}));

describe('OtlpService', () => {
  let service: OtlpService;
  let mockDb: jest.Mocked<typeof db>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OtlpService],
    }).compile();

    service = module.get<OtlpService>(OtlpService);
    mockDb = db as jest.Mocked<typeof db>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processTraceExport', () => {
    it('should process OTLP trace export successfully', async () => {
      const request: OtlpExportTraceServiceRequest = {
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

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const mockInsert = {
        values: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.insert.mockReturnValue(mockInsert as any);

      const result = await service.processTraceExport(request, 'org-123');

      expect(result.spansProcessed).toBe(1);
      expect(result.spansRejected).toBe(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should reject spans without run_id', async () => {
      const request: OtlpExportTraceServiceRequest = {
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

      const result = await service.processTraceExport(request, 'org-123');

      expect(result.spansProcessed).toBe(0);
      expect(result.spansRejected).toBe(1);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should handle multiple resource spans', async () => {
      const request: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: 'evalops.run_id',
                  value: { stringValue: 'run-1' },
                },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    name: 'span1',
                    startTimeUnixNano: '1000000000',
                    attributes: [],
                    events: [],
                  },
                ],
              },
            ],
          },
          {
            resource: {
              attributes: [
                {
                  key: 'evalops.run_id',
                  value: { stringValue: 'run-2' },
                },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-2',
                    spanId: 'span-2',
                    name: 'span2',
                    startTimeUnixNano: '2000000000',
                    attributes: [],
                    events: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const mockInsert = {
        values: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.insert.mockReturnValue(mockInsert as any);

      const result = await service.processTraceExport(request, 'org-123');

      expect(result.spansProcessed).toBe(2);
      expect(result.spansRejected).toBe(0);
    });

    it('should skip spans that already exist (idempotency)', async () => {
      const request: OtlpExportTraceServiceRequest = {
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

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            spanId: 'span-123',
          },
        ]),
      };

      mockDb.select.mockReturnValue(mockSelect as any);

      const result = await service.processTraceExport(request, 'org-123');

      expect(result.spansProcessed).toBe(1);
      expect(result.spansRejected).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should convert hex trace IDs to UUID format', async () => {
      const request: OtlpExportTraceServiceRequest = {
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
                    traceId: 'a1b2c3d4e5f6789012345678901234ab',
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

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const mockInsert = {
        values: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.insert.mockReturnValue(mockInsert as any);

      await service.processTraceExport(request, 'org-123');

      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          traceId: expect.any(String),
        }),
      ]);
    });

    it('should convert attributes correctly', async () => {
      const request: OtlpExportTraceServiceRequest = {
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
                    attributes: [
                      {
                        key: 'string_attr',
                        value: { stringValue: 'test' },
                      },
                      {
                        key: 'int_attr',
                        value: { intValue: '42' },
                      },
                      {
                        key: 'bool_attr',
                        value: { boolValue: true },
                      },
                    ],
                    events: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const mockInsert = {
        values: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.insert.mockReturnValue(mockInsert as any);

      await service.processTraceExport(request, 'org-123');

      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          attributes: expect.objectContaining({
            string_attr: 'test',
            int_attr: '42',
            bool_attr: true,
          }),
        }),
      ]);
    });

    it('should convert events correctly', async () => {
      const request: OtlpExportTraceServiceRequest = {
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
                    events: [
                      {
                        name: 'event1',
                        timeUnixNano: '1500000000',
                        attributes: [
                          {
                            key: 'event_attr',
                            value: { stringValue: 'value' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const mockInsert = {
        values: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.insert.mockReturnValue(mockInsert as any);

      await service.processTraceExport(request, 'org-123');

      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({
              name: 'event1',
              attributes: expect.objectContaining({
                event_attr: 'value',
              }),
            }),
          ]),
        }),
      ]);
    });

    it('should handle spans with missing required fields', async () => {
      const request: OtlpExportTraceServiceRequest = {
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
                    spanId: 'span-123',
                    name: 'test.span',
                    startTimeUnixNano: '1000000000',
                    attributes: [],
                    events: [],
                  } as any,
                ],
              },
            ],
          },
        ],
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect as any);

      const result = await service.processTraceExport(request, 'org-123');

      expect(result.spansProcessed).toBe(0);
      expect(result.spansRejected).toBe(1);
    });
  });
});
