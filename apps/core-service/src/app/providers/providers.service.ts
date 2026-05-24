import { Injectable } from '@nestjs/common';
import { ProvidersRepository } from '@evalops/shared-db';
import { InsertAiProvider } from '@evalops/shared-db';

@Injectable()
export class ProvidersService {
  constructor(private providersRepository: ProvidersRepository) {}

  async getAllProviders() {
    return this.providersRepository.findAll();
  }

  async getProvider(id: string) {
    const provider = await this.providersRepository.findById(id);
    if (!provider) {
      throw new Error(`Provider ${id} not found`);
    }
    return provider;
  }

  async createProvider(providerData: InsertAiProvider) {
    return this.providersRepository.create(providerData);
  }

  async updateProvider(id: string, providerData: Partial<InsertAiProvider>) {
    return this.providersRepository.update(id, providerData);
  }

  async deleteProvider(id: string) {
    await this.providersRepository.delete(id);
    return { message: 'Provider deleted successfully' };
  }
}
