import { Test, TestingModule } from '@nestjs/testing';
import { TraceMigrationService } from './trace-migration.service';
import { TraceEventAdapterService } from '../ingestion/trace-event-adapter.service';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { db } from '@evalops/shared-db';
import { runs, traceSpans } from '@evalops/shared-db';
import { eq, isNotNull, and, sql } from 'drizzle-orm';
import type { Run } from '@evalops/shared-db';
import type { TraceEvent } from '@evalops/sdk';

jest.mock('@evalops/shared-db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
  runs: {},
  traceSpans: {},
  eq: jest.fn(),
  isNotNull: jest.fn(),
  and: jest.fn(),
  sql: jest.fn(),
}));

describe('TraceMigrationService', () => {
  let service: TraceMigrationService;
  let traceEventAdapter: jest.Mocked<TraceEventAdapterService>;
  let storageService: jest.Mocked<DatabaseStorageService>;
  let mockDb: jest.Mocked<typeof db>;

  const createMockRun = (overrides: Partial<Run> = {}): Run => ({
    id: 'run-123',
    name: 'Test Run',
    evalSpecId: 'spec-123',
    policyId: null,
    agentId: null,
    agentVersion: null,
    status: 'completed',
    decision: null,
    startedAt: new Date(),
    completedAt: new Date(),
    metrics: null,
    cost: null,
    duration: null,
    errorMessage: null,
    triggeredBy: 'user-123',
    commitSha: null,
    organizationId: 'org-123',
    description: null,
    traceEvents: null,
    traceMigratedAt: null,
    artifactHashes: null,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const mockTraceEventAdapter = {
      convertAndStore: jest.fn(),
    };

    const mockStorageService = {
      getRun: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TraceMigrationService,
        {
          provide: TraceEventAdapterService,
          useValue: mockTraceEventAdapter,
        },
        {
          provide: DatabaseStorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    service = module.get<TraceMigrationService>(TraceMigrationService);
    traceEventAdapter = module.get(TraceEventAdapterService);
    storageService = module.get(DatabaseStorageService);
    mockDb = db as jest.Mocked<typeof db>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('migrateRun', () => {
    it('should skip run if already migrated', async () => {
      const run = createMockRun({
        traceMigratedAt: new Date(),
        traceEvents: [
          {
            type: 'user_message',
            timestamp: new Date().toISOString(),
            data: {},
          },
        ] as any,
      });

      const result = await service.migrateRun(run);

      expect(result).toBe(0);
      expect(traceEventAdapter.convertAndStore).not.toHaveBeenCalled();
    });

    it('should skip run if no trace events', async () => {
      const run = createMockRun();

      const result = await service.migrateRun(run);

      expect(result).toBe(0);
      expect(traceEventAdapter.convertAndStore).not.toHaveBeenCalled();
    });

    it('should skip run if spans already exist', async () => {
      const run = createMockRun({
        traceEvents: [
          {
            type: 'user_message',
            timestamp: new Date().toISOString(),
            data: {},
          },
        ] as any,
      });

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ count: 1 }]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.update.mockReturnValue(mockUpdate as any);

      const result = await service.migrateRun(run);

      expect(result).toBe(0);
      expect(mockDb.update).toHaveBeenCalledWith(runs);
      expect(traceEventAdapter.convertAndStore).not.toHaveBeenCalled();
    });

    it('should migrate trace events to spans', async () => {
      const run = createMockRun({
        traceEvents: [
          {
            type: 'user_message',
            timestamp: new Date().toISOString(),
            data: { content: 'Hello' },
          },
          {
            type: 'assistant_message',
            timestamp: new Date().toISOString(),
            data: { content: 'Hi' },
          },
        ] as any,
      });

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ count: 0 }]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.update.mockReturnValue(mockUpdate as any);

      traceEventAdapter.convertAndStore
        .mockResolvedValueOnce({
          spansCreated: 2,
          rootSpanId: 'root-1',
          traceId: 'trace-1',
        })
        .mockResolvedValueOnce({
          spansCreated: 1,
          rootSpanId: 'root-2',
          traceId: 'trace-2',
        });

      const result = await service.migrateRun(run);

      expect(result).toBe(3);
      expect(traceEventAdapter.convertAndStore).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalledWith(runs);
      expect(mockUpdate.set).toHaveBeenCalledWith({
        traceMigratedAt: expect.any(Date),
      });
    });

    it('should continue migration even if one event fails', async () => {
      const run = createMockRun({
        traceEvents: [
          {
            type: 'user_message',
            timestamp: new Date().toISOString(),
            data: {},
          },
          {
            type: 'assistant_message',
            timestamp: new Date().toISOString(),
            data: {},
          },
        ] as any,
      });

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ count: 0 }]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select.mockReturnValue(mockSelect as any);
      mockDb.update.mockReturnValue(mockUpdate as any);

      traceEventAdapter.convertAndStore
        .mockRejectedValueOnce(new Error('Conversion failed'))
        .mockResolvedValueOnce({
          spansCreated: 1,
          rootSpanId: 'root-2',
          traceId: 'trace-2',
        });

      const result = await service.migrateRun(run);

      expect(result).toBe(1);
      expect(traceEventAdapter.convertAndStore).toHaveBeenCalledTimes(2);
    });
  });

  describe('migrateAllRuns', () => {
    it('should migrate all runs with trace events', async () => {
      const runsToMigrate: Run[] = [
        createMockRun({
          id: 'run-1',
          evalSpecId: 'spec-1',
          traceEvents: [
            {
              type: 'user_message',
              timestamp: new Date().toISOString(),
              data: {},
            },
          ] as any,
        }),
        createMockRun({
          id: 'run-2',
          name: 'Run 2',
          evalSpecId: 'spec-2',
          traceEvents: [
            {
              type: 'assistant_message',
              timestamp: new Date().toISOString(),
              data: {},
            },
          ] as any,
        }),
      ];

      const mockCountSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: 2 }]),
      };

      const mockRunsSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(runsToMigrate),
      };

      const mockSpansSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ count: 0 }]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select
        .mockReturnValueOnce(mockCountSelect as any)
        .mockReturnValueOnce(mockRunsSelect as any)
        .mockReturnValue(mockSpansSelect as any);

      mockDb.update.mockReturnValue(mockUpdate as any);

      traceEventAdapter.convertAndStore.mockResolvedValue({
        spansCreated: 1,
        rootSpanId: 'root-1',
        traceId: 'trace-1',
      });

      const result = await service.migrateAllRuns();

      expect(result.totalRuns).toBe(2);
      expect(result.migratedRuns).toBe(2);
      expect(result.totalSpansCreated).toBe(2);
      expect(result.failedRuns).toBe(0);
    });

    it('should handle organization filter', async () => {
      const mockCountSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: 0 }]),
      };

      mockDb.select.mockReturnValue(mockCountSelect as any);

      const result = await service.migrateAllRuns('org-123');

      expect(result.totalRuns).toBe(0);
      expect(result.migratedRuns).toBe(0);
    });

    it('should handle batch processing', async () => {
      const batch1: Run[] = Array.from({ length: 100 }, (_, i) =>
        createMockRun({
          id: `run-${i}`,
          name: `Run ${i}`,
          evalSpecId: 'spec-1',
          traceEvents: [
            {
              type: 'user_message',
              timestamp: new Date().toISOString(),
              data: {},
            },
          ] as any,
        })
      );

      const mockCountSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: 100 }]),
      };

      const mockRunsSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(batch1),
      };

      const mockSpansSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ count: 0 }]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select
        .mockReturnValueOnce(mockCountSelect as any)
        .mockReturnValueOnce(mockRunsSelect as any)
        .mockReturnValue(mockSpansSelect as any);

      mockDb.update.mockReturnValue(mockUpdate as any);

      traceEventAdapter.convertAndStore.mockResolvedValue({
        spansCreated: 1,
        rootSpanId: 'root-1',
        traceId: 'trace-1',
      });

      const result = await service.migrateAllRuns();

      expect(result.totalRuns).toBe(100);
      expect(result.migratedRuns).toBe(100);
    });
  });

  describe('getRunMigrationStatus', () => {
    it('should return migration status for a run', async () => {
      const run = createMockRun({
        traceMigratedAt: new Date(),
        traceEvents: [
          {
            type: 'user_message',
            timestamp: new Date().toISOString(),
            data: {},
          },
        ] as any,
      });

      const mockRunSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([run]),
      };

      const mockSpansSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: 5 }]),
      };

      mockDb.select
        .mockReturnValueOnce(mockRunSelect as any)
        .mockReturnValueOnce(mockSpansSelect as any);

      const result = await service.getRunMigrationStatus('run-123');

      expect(result).toMatchObject({
        migrated: true,
        migratedAt: expect.any(Date),
        spanCount: 5,
        traceEventCount: 1,
      });
    });

    it('should handle unmigrated run', async () => {
      const run = createMockRun({
        traceEvents: [
          {
            type: 'user_message',
            timestamp: new Date().toISOString(),
            data: {},
          },
        ] as any,
      });

      const mockRunSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([run]),
      };

      const mockSpansSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ count: 0 }]),
      };

      mockDb.select
        .mockReturnValueOnce(mockRunSelect as any)
        .mockReturnValueOnce(mockSpansSelect as any);

      const result = await service.getRunMigrationStatus('run-123');

      expect(result).toMatchObject({
        migrated: false,
        migratedAt: null,
        spanCount: 0,
        traceEventCount: 1,
      });
    });
  });
});
