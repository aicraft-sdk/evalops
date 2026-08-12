/**
 * Cross-tenant isolation regression test — mirrors this repo's own
 * documented IDOR-history precedent (POST /policies/evaluate/:runId has no
 * org-scoping check on its runId lookup, see project memory). Proves org B
 * cannot read/write org A's golden sets/examples/calibration-runs through
 * GoldenSetsService, which is the layer GoldenSetsController delegates to.
 */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GoldenSetsRepository } from '@evalops/shared-db';
import { GoldenSetsService } from './golden-sets.service';

jest.mock('@evalops/shared-db', () => ({
  GoldenSetsRepository: class GoldenSetsRepository {},
}));

describe('GoldenSetsService cross-tenant isolation', () => {
  let service: GoldenSetsService;
  let repo: {
    findGoldenSetById: jest.Mock;
    listExamples: jest.Mock;
    addExample: jest.Mock;
    listCalibrationRuns: jest.Mock;
    listGoldenSets: jest.Mock;
    createGoldenSet: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findGoldenSetById: jest.fn(),
      listExamples: jest.fn(),
      addExample: jest.fn(),
      listCalibrationRuns: jest.fn(),
      listGoldenSets: jest.fn(),
      createGoldenSet: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoldenSetsService,
        { provide: GoldenSetsRepository, useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(GoldenSetsService);
  });

  it("returns not-found (not another org's data) when the golden set belongs to a different organization: listExamples", async () => {
    repo.findGoldenSetById.mockResolvedValue({ id: 'gs1', organizationId: 'org-OTHER' });

    await expect(service.listExamples('gs1', 'org-mine')).rejects.toThrow(NotFoundException);
    expect(repo.listExamples).not.toHaveBeenCalled();
  });

  it("returns not-found when the golden set belongs to a different organization: addExample", async () => {
    repo.findGoldenSetById.mockResolvedValue({ id: 'gs1', organizationId: 'org-OTHER' });

    await expect(
      service.addExample('gs1', { output: 'x', humanLabel: true }, 'org-mine', 'user-1'),
    ).rejects.toThrow(NotFoundException);
    expect(repo.addExample).not.toHaveBeenCalled();
  });

  it("returns not-found when the golden set belongs to a different organization: listCalibrationRuns", async () => {
    repo.findGoldenSetById.mockResolvedValue({ id: 'gs1', organizationId: 'org-OTHER' });

    await expect(service.listCalibrationRuns('gs1', 'org-mine')).rejects.toThrow(NotFoundException);
    expect(repo.listCalibrationRuns).not.toHaveBeenCalled();
  });

  it("returns not-found when the golden set belongs to a different organization: verifyGoldenSetOwnership (used before delegating to CalibrationService)", async () => {
    repo.findGoldenSetById.mockResolvedValue({ id: 'gs1', organizationId: 'org-OTHER' });

    await expect(service.verifyGoldenSetOwnership('gs1', 'org-mine')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns not-found when the golden set does not exist at all (no leak of existence vs ownership mismatch)', async () => {
    repo.findGoldenSetById.mockResolvedValue(undefined);

    await expect(service.listExamples('gs-missing', 'org-mine')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('allows access when the golden set belongs to the caller organization', async () => {
    repo.findGoldenSetById.mockResolvedValue({ id: 'gs1', organizationId: 'org-mine' });
    repo.listExamples.mockResolvedValue([]);

    await expect(service.listExamples('gs1', 'org-mine')).resolves.toEqual([]);
    expect(repo.listExamples).toHaveBeenCalledWith('gs1');
  });
});
