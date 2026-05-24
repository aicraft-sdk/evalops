import { Injectable } from '@nestjs/common';
import { EvalSpecsRepository } from '@evalops/shared-db';
import { EvalSpec, InsertEvalSpec } from '@evalops/shared-db';

@Injectable()
export class EvalSpecsService {
  constructor(private evalSpecsRepository: EvalSpecsRepository) {}

  async createEvalSpec(evalSpec: InsertEvalSpec): Promise<EvalSpec> {
    return this.evalSpecsRepository.create(evalSpec);
  }

  async updateEvalSpec(
    id: string,
    evalSpec: Partial<InsertEvalSpec>,
  ): Promise<EvalSpec> {
    return this.evalSpecsRepository.update(id, evalSpec);
  }

  async deleteEvalSpec(id: string): Promise<void> {
    return this.evalSpecsRepository.delete(id);
  }
}
