import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { EnhancedAuditEntry } from '@evalops/shared-db';

@Injectable()
export class AuditService {
  constructor(private storageService: DatabaseStorageService) {}

  async getAuditTrail(
    organizationId: string,
    limit = 100,
  ): Promise<EnhancedAuditEntry[]> {
    return this.storageService.getAuditTrailEnhanced(organizationId, limit);
  }
}

