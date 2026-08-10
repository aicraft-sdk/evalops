import { Injectable } from '@nestjs/common';
import {
  UsersRepository,
  OrganizationsRepository,
  UpsertUserInput,
  organizations,
} from '@evalops/shared-db';
import { UpdateOrganizationDto } from './organization-update.dto';

@Injectable()
export class AdminService {
  constructor(
    private usersRepository: UsersRepository,
    private organizationsRepository: OrganizationsRepository,
  ) {}

  async getAllUsers() {
    return this.usersRepository.findAll();
  }

  async getAllOrganizations() {
    return this.organizationsRepository.findAll();
  }

  async updateUserRole(userId: string, role: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return this.usersRepository.upsert({
      ...user,
      role,
    } as UpsertUserInput);
  }

  async updateOrganization(
    organizationId: string,
    organizationData: UpdateOrganizationDto,
  ) {
    return this.organizationsRepository.update(
      organizationId,
      organizationData as Partial<typeof organizations.$inferSelect>,
    );
  }
}




