import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { UpsertUser, InsertOrganization } from '@evalops/shared-db';

@Injectable()
export class AdminService {
  constructor(private storageService: DatabaseStorageService) {}

  async getAllUsers() {
    return this.storageService.getAllUsers();
  }

  async getAllOrganizations() {
    return this.storageService.getAllOrganizations();
  }

  async updateUserRole(userId: string, role: string) {
    const user = await this.storageService.getUser(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return this.storageService.upsertUser({
      ...user,
      role,
    } as UpsertUser);
  }

  async updateOrganization(
    organizationId: string,
    organizationData: Partial<InsertOrganization>,
  ) {
    return this.storageService.updateOrganization(
      organizationId,
      organizationData,
    );
  }

}




