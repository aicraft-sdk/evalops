import crypto from 'crypto';
import { storage } from '../storage';
import type { InsertDataset, InsertDatasetSample } from '@shared/schema';

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

export interface DatasetValidationResult {
  isValid: boolean;
  errors: string[];
  sampleCount: number;
  schema?: any;
}

class DatasetService {
  async uploadDataset(
    upload: DatasetUpload,
    userId: string,
    organizationId: string
  ): Promise<string> {
    // Validate dataset
    const validation = this.validateDataset(upload);
    if (!validation.isValid) {
      throw new Error(`Dataset validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate content hash for deduplication
    const contentHash = this.generateContentHash(upload.samples);
    
    // Check if dataset with same content already exists
    const existingDataset = await storage.findDatasetByContentHash(contentHash);
    if (existingDataset) {
      return existingDataset.id;
    }

    // Store dataset samples in the database
    const storageUrl = this.generateStorageUrl(contentHash);

    // Create dataset record
    const datasetData: InsertDataset = {
      name: upload.name,
      version: 'v1.0.0',
      description: upload.description || '',
      schema: upload.schema || validation.schema,
      sampleCount: validation.sampleCount,
      storageUrl,
      contentHash,
      organizationId,
      createdBy: userId,
    };

    const dataset = await storage.createDataset(datasetData);
    
    // Store samples in database
    const datasetSamples: InsertDatasetSample[] = upload.samples.map((sample, index) => ({
      datasetId: dataset.id,
      sampleIndex: index,
      input: sample.input,
      expected: sample.expected || null,
      metadata: sample.metadata || {},
      organizationId,
    }));
    
    await storage.createDatasetSamples(datasetSamples);
    
    return dataset.id;
  }

  async getDatasetSamples(datasetId: string): Promise<DatasetSample[]> {
    const dataset = await storage.getDataset(datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    // Get samples directly from database
    const dbSamples = await storage.getDatasetSamples(datasetId);
    
    // Convert to expected format
    return dbSamples.map(sample => ({
      input: sample.input,
      expected: sample.expected || undefined,
      metadata: sample.metadata || {},
    }));
  }

  validateDataset(upload: DatasetUpload): DatasetValidationResult {
    const errors: string[] = [];

    // Check basic requirements
    if (!upload.name || upload.name.trim().length === 0) {
      errors.push('Dataset name is required');
    }

    if (!upload.samples || upload.samples.length === 0) {
      errors.push('Dataset must contain at least one sample');
    }

    if (upload.samples && upload.samples.length > 10000) {
      errors.push('Dataset cannot contain more than 10,000 samples');
    }

    // Validate sample structure
    if (upload.samples) {
      upload.samples.forEach((sample, index) => {
        if (!sample.input) {
          errors.push(`Sample ${index + 1}: input is required`);
        }
      });
    }

    // Infer schema if not provided
    let schema = upload.schema;
    if (!schema && upload.samples && upload.samples.length > 0) {
      schema = this.inferSchema(upload.samples);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sampleCount: upload.samples ? upload.samples.length : 0,
      schema,
    };
  }

  private generateContentHash(samples: DatasetSample[]): string {
    const content = JSON.stringify(samples, Object.keys(samples).sort());
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private generateStorageUrl(contentHash: string): string {
    return `dataset://samples/${contentHash}.json`;
  }


  private inferSchema(samples: DatasetSample[]): any {
    // Simple schema inference based on first sample
    const firstSample = samples[0];
    
    const inputType = typeof firstSample.input;
    const expectedType = firstSample.expected ? typeof firstSample.expected : 'string';

    return {
      type: 'object',
      properties: {
        input: { type: inputType },
        expected: { type: expectedType },
      },
      required: ['input'],
    };
  }

  async createVersion(
    datasetId: string,
    upload: DatasetUpload,
    userId: string
  ): Promise<string> {
    const existingDataset = await storage.getDataset(datasetId);
    if (!existingDataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    // Generate new version
    const versionParts = existingDataset.version.split('.');
    const major = parseInt(versionParts[0]?.substring(1) || '1');
    const minor = parseInt(versionParts[1] || '0');
    const patch = parseInt(versionParts[2] || '0');
    
    const newVersion = `v${major}.${minor}.${patch + 1}`;
    
    // Validate and store new version
    const validation = this.validateDataset(upload);
    if (!validation.isValid) {
      throw new Error(`Dataset validation failed: ${validation.errors.join(', ')}`);
    }

    const contentHash = this.generateContentHash(upload.samples);
    const storageUrl = this.generateStorageUrl(contentHash);

    const datasetData: InsertDataset = {
      name: upload.name,
      version: newVersion,
      description: upload.description || existingDataset.description,
      schema: upload.schema || validation.schema,
      sampleCount: validation.sampleCount,
      storageUrl,
      organizationId: existingDataset.organizationId,
      createdBy: userId,
    };

    const newDataset = await storage.createDataset(datasetData);
    return newDataset.id;
  }
}

export const datasetService = new DatasetService();