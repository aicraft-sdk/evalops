import { Test, TestingModule } from '@nestjs/testing';
import { AlertsService } from './alerts.service';
import { AlertRuleService } from './alert-rule.service';
import { AlertNotificationService } from './alert-notification.service';
import { type AlertData } from './alert-rule.service';

const mockAlert1: AlertData = {
  configId: 'cfg-1',
  organizationId: 'org-1',
  severity: 'high',
  title: 'Alert 1',
  message: 'msg 1',
  entityType: 'run',
  entityId: 'run-1',
};
const mockAlert2: AlertData = {
  configId: 'cfg-2',
  organizationId: 'org-1',
  severity: 'medium',
  title: 'Alert 2',
  message: 'msg 2',
  entityType: 'run',
  entityId: 'run-1',
};
const mockAlert3: AlertData = {
  configId: 'cfg-3',
  organizationId: 'org-1',
  severity: 'low',
  title: 'Alert 3',
  message: 'msg 3',
  entityType: 'run',
  entityId: 'run-1',
};

const mockRuleService = {
  checkRunAlerts: jest.fn(),
};

const mockNotificationService = {
  createAndSendAlert: jest.fn(),
};

describe('AlertsService.checkRunAlerts', () => {
  let service: AlertsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: AlertRuleService, useValue: mockRuleService },
        { provide: AlertNotificationService, useValue: mockNotificationService },
      ],
    }).compile();
    service = module.get<AlertsService>(AlertsService);
  });

  it('dispatches all remaining alerts when one createAndSendAlert throws', async () => {
    // Arrange: ruleService returns 3 alerts
    mockRuleService.checkRunAlerts.mockResolvedValue([mockAlert1, mockAlert2, mockAlert3]);

    // Second alert dispatch throws a DB error
    mockNotificationService.createAndSendAlert
      .mockResolvedValueOnce({ id: 'event-1' })
      .mockRejectedValueOnce(new Error('DB failure on alert 2'))
      .mockResolvedValueOnce({ id: 'event-3' });

    // Act — should NOT throw
    await expect(service.checkRunAlerts('run-1')).resolves.toBeUndefined();

    // Assert: all three alerts were attempted, not just the first two
    expect(mockNotificationService.createAndSendAlert).toHaveBeenCalledTimes(3);
    expect(mockNotificationService.createAndSendAlert).toHaveBeenNthCalledWith(1, mockAlert1);
    expect(mockNotificationService.createAndSendAlert).toHaveBeenNthCalledWith(2, mockAlert2);
    expect(mockNotificationService.createAndSendAlert).toHaveBeenNthCalledWith(3, mockAlert3);
  });

  it('completes successfully when all createAndSendAlert calls succeed', async () => {
    mockRuleService.checkRunAlerts.mockResolvedValue([mockAlert1, mockAlert2]);
    mockNotificationService.createAndSendAlert.mockResolvedValue({ id: 'event-x' });

    await expect(service.checkRunAlerts('run-1')).resolves.toBeUndefined();

    expect(mockNotificationService.createAndSendAlert).toHaveBeenCalledTimes(2);
  });
});
