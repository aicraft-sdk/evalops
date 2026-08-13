import { AuditExportService } from './audit-export.service';

describe('AuditExportService', () => {
  it('builds CSV with a header row and one row per audit entry', () => {
    const auditRepository = {
      findEnhancedByOrg: jest.fn().mockResolvedValue([
        {
          id: '1',
          action: 'update',
          entityType: 'prompt',
          entityId: 'p1',
          changes: {},
          organizationId: 'org-1',
          userId: 'u1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          userName: 'a@b.com',
          userFirstName: 'A',
          userLastName: 'B',
        },
      ]),
    };
    const service = new AuditExportService(auditRepository as never);
    return service.buildCsv('org-1', 100).then((csv) => {
      expect(csv.split('\n')[0]).toBe('id,action,entityType,entityId,userName,createdAt');
      expect(csv).toContain('1,update,prompt,p1,a@b.com,2026-01-01T00:00:00.000Z');
    });
  });

  it('passes organizationId and limit through to AuditRepository.findEnhancedByOrg', async () => {
    const auditRepository = { findEnhancedByOrg: jest.fn().mockResolvedValue([]) };
    const service = new AuditExportService(auditRepository as never);

    await service.buildCsv('org-2', 50);

    expect(auditRepository.findEnhancedByOrg).toHaveBeenCalledWith('org-2', 50);
  });

  it('neutralizes a field starting with "=" so spreadsheet software cannot execute it as a formula', async () => {
    const auditRepository = {
      findEnhancedByOrg: jest.fn().mockResolvedValue([
        {
          id: '2',
          action: 'update',
          entityType: 'prompt',
          entityId: 'p2',
          changes: {},
          organizationId: 'org-1',
          userId: 'u1',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          userName: "=cmd|' /C calc'!A1",
          userFirstName: null,
          userLastName: null,
        },
      ]),
    };
    const service = new AuditExportService(auditRepository as never);

    const csv = await service.buildCsv('org-1', 100);
    const dataRow = csv.split('\n')[1];

    // The raw, unescaped formula-injection payload must never appear verbatim.
    expect(dataRow).not.toMatch(/,=cmd\|/);
    // A leading single quote neutralizes formula interpretation while preserving the
    // original value as literal text (Excel/Google Sheets/LibreOffice convention).
    expect(dataRow).toContain("'=cmd|' /C calc'!A1");
  });

  it.each(['+', '-', '@'])(
    'neutralizes a field starting with "%s"',
    async (prefix) => {
      const auditRepository = {
        findEnhancedByOrg: jest.fn().mockResolvedValue([
          {
            id: '3',
            action: 'update',
            entityType: 'prompt',
            entityId: 'p3',
            changes: {},
            organizationId: 'org-1',
            userId: 'u1',
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
            userName: `${prefix}SUM(1+1)`,
            userFirstName: null,
            userLastName: null,
          },
        ]),
      };
      const service = new AuditExportService(auditRepository as never);

      const csv = await service.buildCsv('org-1', 100);
      const dataRow = csv.split('\n')[1];

      expect(dataRow).toContain(`'${prefix}SUM(1+1)`);
    },
  );

  it('quotes a field containing a comma so it does not split into extra CSV columns', async () => {
    const auditRepository = {
      findEnhancedByOrg: jest.fn().mockResolvedValue([
        {
          id: '4',
          action: 'update',
          entityType: 'prompt',
          entityId: 'p4',
          changes: {},
          organizationId: 'org-1',
          userId: 'u1',
          createdAt: new Date('2026-01-04T00:00:00.000Z'),
          userName: 'Smith, Jane',
          userFirstName: null,
          userLastName: null,
        },
      ]),
    };
    const service = new AuditExportService(auditRepository as never);

    const csv = await service.buildCsv('org-1', 100);
    const rows = csv.split('\n');

    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"Smith, Jane"');
  });
});
