import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { User, UpsertUser } from '@evalops/shared-db';

@Injectable()
export class UsersService {
  constructor(private storageService: DatabaseStorageService) {}

  async getUser(id: string): Promise<User | undefined> {
    return this.storageService.getUser(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.storageService.getUserByEmail(email);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    return this.storageService.upsertUser(userData);
  }
}

