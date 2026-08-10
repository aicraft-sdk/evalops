import { Test, TestingModule } from '@nestjs/testing';
import { TraceWriterService } from './trace-writer.service';
import { db } from '@evalops/shared-db';
import { traceSpans } from '@evalops/shared-db';

jest.mock('@evalops/shared-db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  },
  traceSpans: {},
  eq: jest.fn(),
}));

describe('TraceWriterService', () => {
  let service: TraceWriterService;
  let mockDb: { select: jest.Mock; insert: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TraceWriterService],
    }).compile();

    service = module.get<TraceWriterService>(TraceWriterService);
    mockDb = db as unknown as { select: jest.Mock; insert: jest.Mock; update: jest.Mock };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTraceId', () => {
    it('should generate a UUID v4 trace ID', () => {
      const traceId = service.generateTraceId();
      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');
      expect(traceId.length).toBeGreaterThan(0);
    });

    it('should generate unique trace IDs', () => {
      const id1 = service.generateTraceId();
      const id2 = service.generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateSpanId', () => {
    it('should generate a UUID v4 span ID', () => {
      const spanId = service.generateSpanId();
      expect(spanId).toBeDefined();
      expect(typeof spanId).toBe('string');
      expect(spanId.length).toBeGreaterThan(0);
    });

    it('should generate unique span IDs', () => {
      const id1 = service.generateSpanId();
      const id2 = service.generateSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRootSpan', () => {
    it('should create a root span successfully', async () => {
      const mockSpan = {
        traceId: 'trace-123',
        spanId: 'span-root',
        parentSpanId: null,
        name: 'simulation.run',
        startTime: new Date(),
        endTime: null,
        attributes: { run_id: 'run-123' },
        events: [],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockSpan]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const result = await service.createRootSpan('run-123', 'org-123');

      expect(result).toBeDefined();
      expect(result.name).toBe('simulation.run');
      expect(result.parentSpanId).toBeNull();
      expect(mockDb.insert).toHaveBeenCalledWith(traceSpans);
      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'simulation.run',
          runId: 'run-123',
          organizationId: 'org-123',
          parentSpanId: null,
        }),
      ]);
    });

    it('should use provided traceId if given', async () => {
      const mockSpan = {
        traceId: 'provided-trace-id',
        spanId: 'span-root',
        parentSpanId: null,
        name: 'simulation.run',
        startTime: new Date(),
        endTime: null,
        attributes: { run_id: 'run-123' },
        events: [],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockSpan]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const result = await service.createRootSpan(
        'run-123',
        'org-123',
        'provided-trace-id'
      );

      expect(result.traceId).toBe('provided-trace-id');
    });
  });

  describe('createSpan', () => {
    it('should create a child span successfully', async () => {
      const mockSpan = {
        traceId: 'trace-123',
        spanId: 'span-child',
        parentSpanId: 'span-parent',
        name: 'simulation.turn',
        startTime: new Date(),
        endTime: null,
        attributes: { turn: 1 },
        events: [],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockSpan]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const result = await service.createSpan(
        'run-123',
        'org-123',
        'simulation.turn',
        'span-parent',
        'trace-123',
        { turn: 1 }
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('simulation.turn');
      expect(result.parentSpanId).toBe('span-parent');
      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'simulation.turn',
          parentSpanId: 'span-parent',
          traceId: 'trace-123',
          attributes: { turn: 1 },
        }),
      ]);
    });

    it('should handle events in span creation', async () => {
      const mockSpan = {
        traceId: 'trace-123',
        spanId: 'span-child',
        parentSpanId: 'span-parent',
        name: 'llm.call',
        startTime: new Date(),
        endTime: null,
        attributes: {},
        events: [
          {
            name: 'llm.request',
            timestamp: new Date().toISOString(),
            attributes: {},
          },
        ],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockSpan]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const events = [
        {
          name: 'llm.request',
          timestamp: new Date(),
          attributes: {},
        },
      ];

      await service.createSpan(
        'run-123',
        'org-123',
        'llm.call',
        'span-parent',
        'trace-123',
        {},
        events
      );

      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({
              name: 'llm.request',
            }),
          ]),
        }),
      ]);
    });
  });

  describe('endSpan', () => {
    it('should end a span with attributes', async () => {
      const existingSpan = {
        traceId: 'trace-123',
        spanId: 'span-123',
        parentSpanId: null,
        name: 'simulation.turn',
        startTime: new Date(),
        endTime: null,
        attributes: { turn: 1 },
        events: [],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([existingSpan]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.update.mockReturnValue(mockUpdate);

      await service.endSpan('span-123', {
        user_message: 'Hello',
        agent_response: 'Hi there!',
      });

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          endTime: expect.any(Date),
          attributes: expect.objectContaining({
            turn: 1,
            user_message: 'Hello',
            agent_response: 'Hi there!',
          }),
        })
      );
    });

    it('should merge attributes with existing ones', async () => {
      const existingSpan = {
        traceId: 'trace-123',
        spanId: 'span-123',
        parentSpanId: null,
        name: 'simulation.turn',
        startTime: new Date(),
        endTime: null,
        attributes: { turn: 1, existing: 'value' },
        events: [],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([existingSpan]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.update.mockReturnValue(mockUpdate);

      await service.endSpan('span-123', {
        new_attr: 'new_value',
      });

      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            turn: 1,
            existing: 'value',
            new_attr: 'new_value',
          }),
        })
      );
    });

    it('should append events to existing ones', async () => {
      const existingSpan = {
        traceId: 'trace-123',
        spanId: 'span-123',
        parentSpanId: null,
        name: 'llm.call',
        startTime: new Date(),
        endTime: null,
        attributes: {},
        events: [
          {
            name: 'llm.request',
            timestamp: new Date().toISOString(),
            attributes: {},
          },
        ],
        runId: 'run-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([existingSpan]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.update.mockReturnValue(mockUpdate);

      const newEvents = [
        {
          name: 'llm.response',
          timestamp: new Date(),
          attributes: { tokens: 100 },
        },
      ];

      await service.endSpan('span-123', undefined, newEvents);

      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({
              name: 'llm.request',
            }),
            expect.objectContaining({
              name: 'llm.response',
            }),
          ]),
        })
      );
    });

    it('should handle ending span without existing span', async () => {
      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.update.mockReturnValue(mockUpdate);

      await service.endSpan('span-123', { new_attr: 'value' });

      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          endTime: expect.any(Date),
          attributes: { new_attr: 'value' },
        })
      );
    });
  });

  describe('getSpansForRun', () => {
    it('should retrieve all spans for a run', async () => {
      const mockSpans = [
        {
          traceId: 'trace-123',
          spanId: 'span-1',
          name: 'simulation.run',
          startTime: new Date('2024-01-01'),
        },
        {
          traceId: 'trace-123',
          spanId: 'span-2',
          name: 'simulation.turn',
          startTime: new Date('2024-01-02'),
        },
      ];

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockSpans),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSpansForRun('run-123');

      expect(result).toEqual(mockSpans);
      expect(mockSelect.where).toHaveBeenCalled();
      expect(mockSelect.orderBy).toHaveBeenCalled();
    });
  });

  describe('getSpansByTraceId', () => {
    it('should retrieve all spans for a trace', async () => {
      const mockSpans = [
        {
          traceId: 'trace-123',
          spanId: 'span-1',
          name: 'simulation.run',
        },
        {
          traceId: 'trace-123',
          spanId: 'span-2',
          name: 'simulation.turn',
        },
      ];

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockSpans),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSpansByTraceId('trace-123');

      expect(result).toEqual(mockSpans);
    });
  });

  describe('getSpan', () => {
    it('should retrieve a span by ID', async () => {
      const mockSpan = {
        traceId: 'trace-123',
        spanId: 'span-123',
        name: 'simulation.turn',
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockSpan]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSpan('span-123');

      expect(result).toEqual(mockSpan);
    });

    it('should return undefined if span not found', async () => {
      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSpan('non-existent');

      expect(result).toBeUndefined();
    });
  });
});
