import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { EvalSpec, InsertEvalSpec } from '@evalops/shared-db';

@Injectable()
export class EvalSpecsService {
  constructor(private storageService: DatabaseStorageService) {}

  async createEvalSpec(evalSpec: InsertEvalSpec): Promise<EvalSpec> {
    return this.storageService.createEvalSpec(evalSpec);
  }

  async updateEvalSpec(
    id: string,
    evalSpec: Partial<InsertEvalSpec>,
  ): Promise<EvalSpec> {
    return this.storageService.updateEvalSpec(id, evalSpec);
  }

  async deleteEvalSpec(id: string): Promise<void> {
    return this.storageService.deleteEvalSpec(id);
  }
}

