import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { InsertAiProvider } from '@evalops/shared-db';

@Injectable()
export class ProvidersService {
  constructor(private storageService: DatabaseStorageService) {}

  async getAllProviders() {
    return this.storageService.getProviders();
  }

  async getProvider(id: string) {
    const provider = await this.storageService.getProvider(id);
    if (!provider) {
      throw new Error(`Provider ${id} not found`);
    }
    return provider;
  }

  async createProvider(providerData: InsertAiProvider) {
    return this.storageService.createProvider(providerData);
  }

  async updateProvider(id: string, providerData: Partial<InsertAiProvider>) {
    return this.storageService.updateProvider(id, providerData);
  }

  async deleteProvider(id: string) {
    await this.storageService.deleteProvider(id);
    return { message: 'Provider deleted successfully' };
  }
}




