import { Injectable } from '@nestjs/common';
import { OrganizationsRepository, organizations } from '@evalops/shared-db';
import { Organization } from '@evalops/shared-db';
import { CreateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(private organizationsRepository: OrganizationsRepository) {}

  async getOrganization(id: string): Promise<Organization | undefined> {
    return this.organizationsRepository.findById(id) as Promise<Organization | undefined>;
  }

  /**
   * Self-service create-organization flow: ANY authenticated user may create
   * a brand new organization. The creating user becomes that new org's
   * ORG_ADMIN via a membership row scoped to the new org only — their role
   * in default-org (or any other org) is untouched.
   */
  async createOrganizationForUser(
    organization: CreateOrganizationDto,
    userId: string,
  ): Promise<Organization> {
    return this.organizationsRepository.createWithAdminMember(
      organization as typeof organizations.$inferInsert,
      userId,
    ) as Promise<Organization>;
  }
}

