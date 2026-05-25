import { ApiFetcher } from '../http';

export interface EvalScenario {
  id?: string;
  name: string;
  [key: string]: unknown;
}

export interface EvalSpecData {
  name: string;
  description?: string;
  version?: string;
  scenarios?: EvalScenario[];
  [key: string]: unknown;
}

export interface EvalSpecResponse {
  id: string;
  name: string;
  organizationId: string;
  [key: string]: unknown;
}

export class SpecsResource {
  constructor(private readonly fetch: ApiFetcher) {}

  async upsertFromYaml(filePath: string): Promise<EvalSpecResponse> {
    const fs = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const content = await fs.readFile(filePath, 'utf-8');
    const spec: EvalSpecData = parse(content);
    return this.upsert(spec);
  }

  async upsert(spec: EvalSpecData): Promise<EvalSpecResponse> {
    // Check if a spec with this name already exists and update it; otherwise create
    const existing = await this.findByName(spec.name);
    if (existing) {
      return this.fetch('PUT', `/api/core/eval-specs/${existing.id}`, spec);
    }
    return this.fetch('POST', '/api/core/eval-specs', spec);
  }

  async findByName(name: string): Promise<EvalSpecResponse | undefined> {
    const all = await this.list();
    return all.find((s) => s.name === name);
  }

  list(): Promise<EvalSpecResponse[]> {
    return this.fetch('GET', '/api/core/eval-specs');
  }

  get(id: string): Promise<EvalSpecResponse> {
    return this.fetch('GET', `/api/core/eval-specs/${id}`);
  }
}
