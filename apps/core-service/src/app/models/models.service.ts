import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { InsertModel } from '@evalops/shared-db';

@Injectable()
export class ModelsService {
  constructor(private storageService: DatabaseStorageService) {}

  async getAllModels(providerId?: string) {
    return this.storageService.getModels(providerId);
  }

  async getModel(id: string) {
    const model = await this.storageService.getModel(id);
    if (!model) {
      throw new Error(`Model ${id} not found`);
    }
    return model;
  }

  async createModel(modelData: InsertModel) {
    return this.storageService.createModel(modelData);
  }

  async updateModel(id: string, modelData: Partial<InsertModel>) {
    return this.storageService.updateModel(id, modelData);
  }

  async deleteModel(id: string) {
    await this.storageService.deleteModel(id);
    return { message: 'Model deleted successfully' };
  }
}




