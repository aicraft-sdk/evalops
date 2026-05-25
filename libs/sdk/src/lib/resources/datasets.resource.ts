import { ApiFetcher } from '../http';

export interface DatasetItem {
  [key: string]: unknown;
}

export interface DatasetResponse {
  id: string;
  name: string;
  organizationId: string;
  samples?: DatasetItem[];
  [key: string]: unknown;
}

export class DatasetsResource {
  constructor(private readonly fetch: ApiFetcher) {}

  push(data: { name: string; items: DatasetItem[] }): Promise<DatasetResponse> {
    return this.fetch('POST', '/api/core/datasets', data);
  }

  async pushFromFile(filePath: string): Promise<DatasetResponse> {
    const fs = await import('node:fs/promises');
    const { parse } = await import('yaml');
    const content = await fs.readFile(filePath, 'utf-8');
    const lower = filePath.toLowerCase();
    const parsed: { name?: string; items?: DatasetItem[] } =
      lower.endsWith('.yaml') || lower.endsWith('.yml')
        ? parse(content)
        : JSON.parse(content);
    const name = parsed.name ?? filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'dataset';
    return this.push({ name, items: parsed.items ?? [] });
  }

  list(): Promise<DatasetResponse[]> {
    return this.fetch('GET', '/api/core/datasets');
  }

  get(id: string): Promise<DatasetResponse> {
    return this.fetch('GET', `/api/core/datasets/${id}`);
  }
}
