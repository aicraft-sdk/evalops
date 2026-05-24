import { Test, TestingModule } from '@nestjs/testing';
import { AlertRuleService } from './alert-rule.service';
import { CicdRepository, AlertsRepository } from '@evalops/shared-db';
import { type Run } from '@evalops/shared-db';

/** Minimal Run stub sufficient for alert-rule tests */
const mockRun: Run = {
  id: 'run-1',
  organizationId: 'org-1',
  evalSpecId: 'spec-1',
  status: 'completed',
  duration: 120,
  cost: 0.5,
  completedAt: new Date().toISOString(),
} as unknown as Run;

const mockCicdRepository = {
  findEvalRunById: jest.fn(),
  findPolicyViolationsByRun: jest.fn(),
  findEvalRunsByEvalSpec: jest.fn(),
  findEvalRunsByOrg: jest.fn(),
};

const mockAlertsRepository = {
  findConfigsByOrg: jest.fn(),
};

describe('AlertRuleService.checkRunAlerts', () => {
  let service: AlertRuleService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertRuleService,
        { provide: CicdRepository, useValue: mockCicdRepository },
        { provide: AlertsRepository, useValue: mockAlertsRepository },
      ],
    }).compile();
    service = module.get<AlertRuleService>(AlertRuleService);
  });

  it('returns alerts from successful sub-checks even when one sub-check rejects', async () => {
    // Arrange: make getPolicyViolationsByRun throw to simulate checkPolicyViolationAlerts failing.
    // checkPerformanceAlerts and checkCostAlerts both call getAlertConfigs.
    // checkCostAlerts: run.cost=0.5, config.maxCostPerRun=0.1 → alert fires.
    // checkPerformanceAlerts: run.duration=120, return no performance configs → no alert.
    mockCicdRepository.findEvalRunById.mockResolvedValue(mockRun);
    mockCicdRepository.findPolicyViolationsByRun.mockRejectedValue(
      new Error('DB failure in policy check'),
    );
    mockAlertsRepository.findConfigsByOrg.mockImplementation((_orgId: string) => {
      // Both checkPerformanceAlerts and checkCostAlerts call this.
      // Return a cost-type config and a performance config that won't fire.
      return Promise.resolve([
        {
          id: 'cost-config-1',
          type: 'cost',
          isActive: true,
          conditions: { maxCostPerRun: 0.1 }, // run.cost=0.5 > 0.1 → alert fires
        },
        {
          id: 'perf-config-1',
          type: 'performance',
          isActive: true,
          // maxDurationSeconds=999 > run.duration=120 → no alert
          conditions: { maxDurationSeconds: 999 },
        },
      ]);
    });

    // Act
    const alerts = await service.checkRunAlerts('run-1');

    // Assert: cost alert collected even though policy check rejected
    expect(alerts).toHaveLength(1);
    expect(alerts[0].configId).toBe('cost-config-1');
    expect(alerts[0].title).toBe('Cost Threshold Exceeded');
  });

  it('returns empty array when all three sub-checks reject', async () => {
    mockCicdRepository.findEvalRunById.mockResolvedValue(mockRun);
    // All three checks will throw
    mockCicdRepository.findPolicyViolationsByRun.mockRejectedValue(new Error('DB error'));
    mockAlertsRepository.findConfigsByOrg.mockRejectedValue(new Error('DB error'));

    const alerts = await service.checkRunAlerts('run-1');

    expect(alerts).toEqual([]);
  });
});
