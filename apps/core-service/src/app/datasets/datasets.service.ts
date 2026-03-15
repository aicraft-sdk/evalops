import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { Dataset, InsertDataset, InsertDatasetSample } from '@evalops/shared-db';
import crypto from 'crypto';

export interface DatasetSample {
  input: any;
  expected?: any;
  metadata?: Record<string, any>;
}

export interface DatasetUpload {
  name: string;
  description?: string;
  samples: DatasetSample[];
  schema?: any;
}

@Injectable()
export class DatasetsService {
  constructor(private storageService: DatabaseStorageService) {}

  async uploadDataset(
    upload: DatasetUpload,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const contentHash = this.generateContentHash(upload.samples);
    const existingDataset =
      await this.storageService.findDatasetByContentHash(contentHash);
    if (existingDataset) {
      return existingDataset.id;
    }

    const datasetData: InsertDataset = {
      name: upload.name,
      version: 'v1.0.0',
      description: upload.description || '',
      schema: upload.schema || this.inferSchema(upload.samples),
      sampleCount: upload.samples.length,
      storageUrl: `dataset://${contentHash}`,
      contentHash,
      organizationId,
      createdBy: userId,
    };

    const dataset = await this.storageService.createDataset(datasetData);

    const datasetSamples: InsertDatasetSample[] = upload.samples.map(
      (sample, index) => ({
        datasetId: dataset.id,
        sampleIndex: index,
        input: sample.input,
        expected: sample.expected || null,
        metadata: sample.metadata || {},
        organizationId,
      }),
    );

    await this.storageService.createDatasetSamples(datasetSamples);

    return dataset.id;
  }

  async getDatasetSamples(datasetId: string): Promise<DatasetSample[]> {
    const dataset = await this.storageService.getDataset(datasetId);
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    const dbSamples = await this.storageService.getDatasetSamples(datasetId);

    return dbSamples.map((sample) => ({
      input: sample.input,
      expected: sample.expected || undefined,
      metadata: sample.metadata || {},
    }));
  }

  private generateContentHash(samples: DatasetSample[]): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(samples))
      .digest('hex');
  }

  private inferSchema(samples: DatasetSample[]): any {
    if (samples.length === 0) return {};

    const firstSample = samples[0];
    return {
      input: this.inferType(firstSample.input),
      expected: firstSample.expected
        ? this.inferType(firstSample.expected)
        : undefined,
    };
  }

  private inferType(value: any): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object' && value !== null) return 'object';
    return 'unknown';
  }
}

