import { Injectable } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { Flow, InsertFlow } from '@evalops/shared-db';

@Injectable()
export class FlowsService {
  constructor(private storageService: DatabaseStorageService) {}

  async createFlow(flow: InsertFlow): Promise<Flow> {
    return this.storageService.createFlow(flow);
  }

  async updateFlow(id: string, flow: Partial<InsertFlow>): Promise<Flow> {
    return this.storageService.updateFlow(id, flow);
  }

  async deleteFlow(id: string): Promise<void> {
    return this.storageService.deleteFlow(id);
  }
}

