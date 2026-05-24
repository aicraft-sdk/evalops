import { Injectable } from '@nestjs/common';
import { ModelsRepository } from '@evalops/shared-db';
import { InsertModel } from '@evalops/shared-db';

@Injectable()
export class ModelsService {
  constructor(private modelsRepository: ModelsRepository) {}

  async getAllModels(providerId?: string) {
    return this.modelsRepository.findAll(providerId);
  }

  async getModel(id: string) {
    const model = await this.modelsRepository.findById(id);
    if (!model) {
      throw new Error(`Model ${id} not found`);
    }
    return model;
  }

  async createModel(modelData: InsertModel) {
    return this.modelsRepository.create(modelData);
  }

  async updateModel(id: string, modelData: Partial<InsertModel>) {
    return this.modelsRepository.update(id, modelData);
  }

  async deleteModel(id: string) {
    await this.modelsRepository.delete(id);
    return { message: 'Model deleted successfully' };
  }
}
