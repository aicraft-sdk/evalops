import { Injectable, NotFoundException } from '@nestjs/common';
import { DatasetsRepository } from '@evalops/shared-db';
import { InsertDataset, InsertDatasetSample } from '@evalops/shared-db';
import * as crypto from 'crypto';

export interface DatasetSample {
  input: unknown;
  expected?: unknown;
  metadata?: Record<string, unknown>;
}

export interface DatasetUpload {
  name: string;
  description?: string;
  samples: DatasetSample[];
  schema?: unknown;
}

@Injectable()
export class DatasetsService {
  constructor(private datasetsRepository: DatasetsRepository) {}

  async uploadDataset(
    upload: DatasetUpload,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const contentHash = this.generateContentHash(upload.samples);
    const existingDataset =
      await this.datasetsRepository.findByContentHash(contentHash);
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

    const dataset = await this.datasetsRepository.create(datasetData);

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

    await this.datasetsRepository.createSamples(datasetSamples);

    return dataset.id;
  }

  async getDatasetSamples(datasetId: string): Promise<DatasetSample[]> {
    const dataset = await this.datasetsRepository.findById(datasetId);
    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    const dbSamples = await this.datasetsRepository.findSamplesByDataset(datasetId);

    return dbSamples.map((sample) => ({
      input: sample.input,
      expected: sample.expected || undefined,
      metadata: (sample.metadata as Record<string, unknown>) || {},
    }));
  }

  private generateContentHash(samples: DatasetSample[]): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(samples))
      .digest('hex');
  }

  private inferSchema(samples: DatasetSample[]): unknown {
    if (samples.length === 0) return {};

    const firstSample = samples[0];
    return {
      input: this.inferType(firstSample.input),
      expected: firstSample.expected
        ? this.inferType(firstSample.expected)
        : undefined,
    };
  }

  private inferType(value: unknown): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object' && value !== null) return 'object';
    return 'unknown';
  }
}
