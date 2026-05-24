import { Injectable } from '@nestjs/common';
import { OrganizationsRepository, organizations } from '@evalops/shared-db';
import { Organization, InsertOrganization } from '@evalops/shared-db';

@Injectable()
export class OrganizationsService {
  constructor(private organizationsRepository: OrganizationsRepository) {}

  async getOrganization(id: string): Promise<Organization | undefined> {
    return this.organizationsRepository.findById(id) as Promise<Organization | undefined>;
  }

  async createOrganization(
    organization: InsertOrganization,
  ): Promise<Organization> {
    return this.organizationsRepository.create(
      organization as typeof organizations.$inferInsert,
    ) as Promise<Organization>;
  }
}

