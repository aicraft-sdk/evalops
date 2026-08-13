import { Injectable } from '@nestjs/common';
import { AuditRepository } from '@evalops/shared-db';

/**
 * Characters that, when they lead a CSV field, are interpreted as a formula by
 * spreadsheet software (Excel, Google Sheets, LibreOffice Calc) when the file is
 * opened — the "CSV injection" / "formula injection" vulnerability class. Audit-trail
 * field values (e.g. `userName`, derived from a user-controlled email) are untrusted
 * input and must never reach the export unescaped.
 */
const CSV_FORMULA_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Escapes a single CSV field: neutralizes leading formula-trigger characters by
 * prefixing a literal single quote (the standard Excel/Sheets/LibreOffice convention
 * for "treat this cell as text"), then applies standard CSV quoting for any value
 * containing a comma, double quote, or newline so it cannot split into extra columns
 * or rows.
 */
function sanitizeCsvField(value: string): string {
  let field = value;
  if (field.length > 0 && CSV_FORMULA_INJECTION_PREFIXES.includes(field[0])) {
    field = `'${field}`;
  }
  if (/[",\n\r]/.test(field)) {
    field = `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

@Injectable()
export class AuditExportService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async buildCsv(organizationId: string, limit = 1000): Promise<string> {
    const entries = await this.auditRepository.findEnhancedByOrg(organizationId, limit);
    const header = 'id,action,entityType,entityId,userName,createdAt';
    const rows = entries.map((entry) =>
      [
        sanitizeCsvField(entry.id ?? ''),
        sanitizeCsvField(entry.action ?? ''),
        sanitizeCsvField(entry.entityType ?? ''),
        sanitizeCsvField(entry.entityId ?? ''),
        sanitizeCsvField(entry.userName ?? ''),
        sanitizeCsvField(entry.createdAt?.toISOString() ?? ''),
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }
}
