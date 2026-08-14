import { PrDecorationService } from './pr-decoration.service';

describe('PrDecorationService', () => {
  it('builds one annotation per scenario-level run result, org-scoped', async () => {
    const runsService = {
      getRun: jest.fn().mockResolvedValue({ id: 'run-1', organizationId: 'org-1', name: 'Suite Run', decision: 'fail' }),
    };
    const service = new PrDecorationService(runsService as never);
    const result = await service.buildDecoration('org-1', 'run-1');
    expect(result.entitled).toBe(true);
    expect(result.scenarios[0]).toEqual(expect.objectContaining({ name: 'Suite Run', decision: 'fail' }));
  });

  it('throws ForbiddenException when the run belongs to a different organization', async () => {
    const runsService = { getRun: jest.fn().mockResolvedValue({ id: 'run-1', organizationId: 'org-OTHER' }) };
    const service = new PrDecorationService(runsService as never);
    await expect(service.buildDecoration('org-1', 'run-1')).rejects.toThrow();
  });
});
