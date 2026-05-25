import { ApiFetcher } from '../http';

export interface AgentResponse {
  id: string;
  name: string;
  version?: string;
  [key: string]: unknown;
}

export class AgentsResource {
  constructor(private readonly fetch: ApiFetcher) {}

  async publishFromFile(filePath: string): Promise<AgentResponse> {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return this.fetch('POST', '/api/core/agents', { content, filePath });
  }

  list(): Promise<AgentResponse[]> {
    return this.fetch('GET', '/api/core/agents');
  }
}
