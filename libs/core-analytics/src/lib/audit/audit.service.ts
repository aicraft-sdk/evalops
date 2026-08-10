import { Injectable } from '@nestjs/common';
import { AuditRepository } from '@evalops/shared-db';
import { EnhancedAuditEntry } from '@evalops/shared-db';

@Injectable()
export class AuditService {
  constructor(private auditRepository: AuditRepository) {}

  async getAuditTrail(
    organizationId: string,
    limit = 100,
  ): Promise<EnhancedAuditEntry[]> {
    return this.auditRepository.findEnhancedByOrg(organizationId, limit);
  }
}

