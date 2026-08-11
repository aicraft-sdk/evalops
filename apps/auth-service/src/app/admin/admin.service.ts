import { Injectable } from '@nestjs/common';
import {
  UsersRepository,
  OrganizationsRepository,
  organizations,
} from '@evalops/shared-db';
import { UserRole } from '@evalops/shared-auth';
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

  async updateUserRole(userId: string, role: UserRole) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return this.usersRepository.updateRole(userId, role);
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




