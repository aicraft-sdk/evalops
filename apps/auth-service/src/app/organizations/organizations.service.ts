import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { Organization, InsertOrganization } from '@evalops/shared-db';

@Injectable()
export class OrganizationsService {
  constructor(private storageService: DatabaseStorageService) {}

  async getOrganization(id: string): Promise<Organization | undefined> {
    return this.storageService.getOrganization(id);
  }

  async createOrganization(
    organization: InsertOrganization,
  ): Promise<Organization> {
    return this.storageService.createOrganization(organization);
  }
}

