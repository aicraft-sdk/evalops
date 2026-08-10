import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SimulationsService } from './simulations.service';
import { db } from '@evalops/shared-db';
import {
  simulationSuites,
  simulationScenarios,
  simulationRuns,
} from '@evalops/shared-db';
jest.mock('@evalops/shared-db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  simulationSuites: {},
  simulationScenarios: {},
  simulationRuns: {},
  eq: jest.fn(),
  and: jest.fn(),
  desc: jest.fn(),
}));

describe('SimulationsService', () => {
  let service: SimulationsService;
  let mockDb: { select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SimulationsService],
    }).compile();

    service = module.get<SimulationsService>(SimulationsService);
    mockDb = db as unknown as { select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSuite', () => {
    it('should create a suite successfully', async () => {
      const suiteData = {
        name: 'Test Suite',
        version: '1.0.0',
        description: 'Test description',
        config: {},
      };

      const createdSuite = {
        id: 'suite-123',
        ...suiteData,
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([createdSuite]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      const result = await service.createSuite(
        suiteData,
        'org-123',
        'user-123'
      );

      expect(result).toEqual(createdSuite);
      expect(mockDb.insert).toHaveBeenCalledWith(simulationSuites);
      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          ...suiteData,
          organizationId: 'org-123',
          createdBy: 'user-123',
        }),
      ]);
    });

    it('should use default config if not provided', async () => {
      const suiteData = {
        name: 'Test Suite',
        version: '1.0.0',
      };

      const createdSuite = {
        id: 'suite-123',
        ...suiteData,
        config: {},
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([createdSuite]),
      };

      mockDb.insert.mockReturnValue(mockInsert);

      await service.createSuite(suiteData, 'org-123', 'user-123');

      expect(mockInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({
          config: {},
        }),
      ]);
    });
  });

  describe('getSuites', () => {
    it('should retrieve all suites for an organization', async () => {
      const mockSuites = [
        {
          id: 'suite-1',
          name: 'Suite 1',
          organizationId: 'org-123',
        },
        {
          id: 'suite-2',
          name: 'Suite 2',
          organizationId: 'org-123',
        },
      ];

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockSuites),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSuites('org-123');

      expect(result).toEqual(mockSuites);
      expect(mockSelect.where).toHaveBeenCalled();
      expect(mockSelect.orderBy).toHaveBeenCalled();
    });
  });

  describe('getSuite', () => {
    it('should retrieve a suite by ID', async () => {
      const mockSuite = {
        id: 'suite-123',
        name: 'Test Suite',
        organizationId: 'org-123',
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockSuite]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSuite('suite-123', 'org-123');

      expect(result).toEqual(mockSuite);
    });

    it('should throw NotFoundException if suite not found', async () => {
      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      await expect(service.getSuite('non-existent', 'org-123')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateSuite', () => {
    it('should update a suite successfully', async () => {
      const existingSuite = {
        id: 'suite-123',
        name: 'Old Name',
        organizationId: 'org-123',
      };

      const updatedSuite = {
        ...existingSuite,
        name: 'New Name',
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([existingSuite]),
      };

      const mockUpdate = {
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([updatedSuite]),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.update.mockReturnValue(mockUpdate);

      const result = await service.updateSuite(
        'suite-123',
        { name: 'New Name' },
        'org-123'
      );

      expect(result).toEqual(updatedSuite);
      expect(mockDb.update).toHaveBeenCalledWith(simulationSuites);
    });

    it('should throw NotFoundException if suite not found', async () => {
      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      await expect(
        service.updateSuite('non-existent', { name: 'New Name' }, 'org-123')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSuite', () => {
    it('should delete a suite successfully', async () => {
      const existingSuite = {
        id: 'suite-123',
        name: 'Test Suite',
        organizationId: 'org-123',
      };

      const mockGetSuiteSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([existingSuite]),
      };

      const mockScenariosSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      const mockDelete = {
        where: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.select
        .mockReturnValueOnce(mockGetSuiteSelect)
        .mockReturnValueOnce(mockScenariosSelect);
      mockDb.delete.mockReturnValue(mockDelete);

      await service.deleteSuite('suite-123', 'org-123');

      expect(mockDb.delete).toHaveBeenCalledWith(simulationSuites);
    });

    it('should throw BadRequestException if suite has scenarios', async () => {
      const existingSuite = {
        id: 'suite-123',
        name: 'Test Suite',
        organizationId: 'org-123',
      };

      const mockGetSuiteSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([existingSuite]),
      };

      const mockScenariosSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ id: 'scenario-1' }]),
      };

      mockDb.select
        .mockReturnValueOnce(mockGetSuiteSelect)
        .mockReturnValueOnce(mockScenariosSelect);

      await expect(service.deleteSuite('suite-123', 'org-123')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('createScenario', () => {
    it('should create a scenario successfully', async () => {
      const suite = {
        id: 'suite-123',
        organizationId: 'org-123',
      };

      const scenarioData = {
        name: 'Test Scenario',
        order: 1,
        definition: {
          agentId: 'agent-123',
          turns: [{ userMessage: 'Hello' }],
        },
      };

      const createdScenario = {
        id: 'scenario-123',
        suiteId: 'suite-123',
        ...scenarioData,
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([suite]),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([createdScenario]),
      };

      mockDb.select.mockReturnValue(mockSelect);
      mockDb.insert.mockReturnValue(mockInsert);

      const result = await service.createScenario(
        'suite-123',
        scenarioData,
        'org-123'
      );

      expect(result).toEqual(createdScenario);
      expect(mockDb.insert).toHaveBeenCalledWith(simulationScenarios);
    });

    it('should throw BadRequestException if definition missing turns', async () => {
      const suite = {
        id: 'suite-123',
        organizationId: 'org-123',
      };

      const scenarioData = {
        name: 'Test Scenario',
        order: 1,
        definition: {
          agentId: 'agent-123',
        },
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([suite]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      await expect(
        service.createScenario('suite-123', scenarioData, 'org-123')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getScenariosForSuite', () => {
    it('should retrieve all scenarios for a suite', async () => {
      const suite = {
        id: 'suite-123',
        organizationId: 'org-123',
      };

      const mockScenarios = [
        {
          id: 'scenario-1',
          suiteId: 'suite-123',
          order: 1,
        },
        {
          id: 'scenario-2',
          suiteId: 'suite-123',
          order: 2,
        },
      ];

      const mockSuiteSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([suite]),
      };

      const mockScenariosSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockScenarios),
      };

      mockDb.select
        .mockReturnValueOnce(mockSuiteSelect)
        .mockReturnValueOnce(mockScenariosSelect);

      const result = await service.getScenariosForSuite('suite-123', 'org-123');

      expect(result).toEqual(mockScenarios);
    });
  });

  describe('getScenario', () => {
    it('should retrieve a scenario by ID', async () => {
      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        organizationId: 'org-123',
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockScenario]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getScenario('scenario-123', 'org-123');

      expect(result).toEqual(mockScenario);
    });

    it('should throw NotFoundException if scenario not found', async () => {
      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      await expect(
        service.getScenario('non-existent', 'org-123')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSimulationRun', () => {
    it('should create a simulation run link successfully', async () => {
      const simulationRun = {
        id: 'sim-run-123',
        runId: 'run-123',
        suiteId: 'suite-123',
        scenarioId: 'scenario-123',
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      const mockInsert = {
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([simulationRun]),
      };

      const mockSuiteSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            id: 'suite-123',
            organizationId: 'org-123',
          },
        ]),
      };

      const mockScenarioSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([
          {
            id: 'scenario-123',
            organizationId: 'org-123',
          },
        ]),
      };

      mockDb.select
        .mockReturnValueOnce(mockSuiteSelect)
        .mockReturnValueOnce(mockScenarioSelect);
      mockDb.insert.mockReturnValue(mockInsert);

      const result = await service.createSimulationRun(
        'run-123',
        'suite-123',
        'scenario-123',
        'org-123'
      );

      expect(result).toEqual(simulationRun);
      expect(mockDb.insert).toHaveBeenCalledWith(simulationRuns);
    });
  });

  describe('getSimulationRunByRunId', () => {
    it('should retrieve simulation run by run ID', async () => {
      const mockSimRun = {
        id: 'sim-run-123',
        runId: 'run-123',
        suiteId: 'suite-123',
        scenarioId: 'scenario-123',
        organizationId: 'org-123',
      };

      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockSimRun]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSimulationRunByRunId(
        'run-123',
        'org-123'
      );

      expect(result).toEqual(mockSimRun);
    });

    it('should return undefined if not found', async () => {
      const mockSelect = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDb.select.mockReturnValue(mockSelect);

      const result = await service.getSimulationRunByRunId(
        'non-existent',
        'org-123'
      );

      expect(result).toBeNull();
    });
  });
});
