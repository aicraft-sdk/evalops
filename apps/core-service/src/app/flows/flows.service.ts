import { Injectable } from '@nestjs/common';
import { FlowsRepository } from '@evalops/shared-db';
import { flows } from '@evalops/shared-db';

@Injectable()
export class FlowsService {
  constructor(private flowsRepository: FlowsRepository) {}

  async createFlow(
    data: typeof flows.$inferInsert,
  ): Promise<typeof flows.$inferSelect> {
    return this.flowsRepository.create(data);
  }

  async updateFlow(
    id: string,
    data: Partial<typeof flows.$inferInsert>,
  ): Promise<typeof flows.$inferSelect> {
    return this.flowsRepository.update(id, data);
  }

  async deleteFlow(id: string): Promise<void> {
    return this.flowsRepository.delete(id);
  }
}
