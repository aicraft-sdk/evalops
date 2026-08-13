import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Validates the `?limit` query param on `GET /audit-trail/export`. Without this DTO, an
 * unvalidated `limit` multiplies directly into `AuditRepository.findEnhancedByOrg`'s query
 * volume (resource-exhaustion risk) and malformed input (non-numeric/negative) previously
 * reached the DB layer unchecked instead of failing a real `400`.
 */
export class AuditExportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}
