import { datasetService } from '../../services/datasetService';
import { storage } from '../../storage';
import type { DatasetUpload } from '../../services/datasetService';

// Mock the storage module
jest.mock('../../storage');
const mockStorage = storage as jest.Mocked<typeof storage>;

describe('DatasetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadDataset', () => {
    const mockUpload: DatasetUpload = {
      name: 'Test Dataset',
      description: 'A test dataset',
      samples: [
        { input: 'What is AI?', expected: 'Artificial Intelligence' },
        { input: 'How does ML work?', expected: 'Machine Learning works by learning patterns' },
      ],
    };

    it('should upload a new dataset successfully', async () => {
      mockStorage.findDatasetByContentHash.mockResolvedValue(undefined);
      mockStorage.createDataset.mockResolvedValue({
        id: 'dataset-123',
        name: 'Test Dataset',
        version: 'v1.0.0',
        description: 'A test dataset',
        schema: expect.any(Object),
        sampleCount: 2,
        contentHash: expect.any(String),
        storageUrl: expect.any(String),
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      });

      const result = await datasetService.uploadDataset(mockUpload, 'user-123', 'org-123');

      expect(result).toBe('dataset-123');
      expect(mockStorage.findDatasetByContentHash).toHaveBeenCalled();
      expect(mockStorage.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Dataset',
          version: 'v1.0.0',
          sampleCount: 2,
          organizationId: 'org-123',
          createdBy: 'user-123',
        })
      );
    });

    it('should return existing dataset if content hash matches', async () => {
      const existingDataset = {
        id: 'existing-dataset-123',
        name: 'Existing Dataset',
        version: 'v1.0.0',
        description: 'An existing dataset',
        schema: {},
        sampleCount: 2,
        contentHash: 'existing-hash',
        storageUrl: 'dataset://samples/existing-hash.json',
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      mockStorage.findDatasetByContentHash.mockResolvedValue(existingDataset);

      const result = await datasetService.uploadDataset(mockUpload, 'user-123', 'org-123');

      expect(result).toBe('existing-dataset-123');
      expect(mockStorage.createDataset).not.toHaveBeenCalled();
    });

    it('should validate dataset and throw error for invalid data', async () => {
      const invalidUpload: DatasetUpload = {
        name: '',
        samples: [],
      };

      await expect(
        datasetService.uploadDataset(invalidUpload, 'user-123', 'org-123')
      ).rejects.toThrow('Dataset validation failed: Dataset name is required, Dataset must contain at least one sample');
    });

    it('should validate samples and throw error for missing input', async () => {
      const invalidUpload: DatasetUpload = {
        name: 'Test Dataset',
        samples: [
          { input: 'Valid input', expected: 'Valid output' },
          { input: '', expected: 'Invalid input' }, // Missing proper input
        ],
      };

      await expect(
        datasetService.uploadDataset(invalidUpload, 'user-123', 'org-123')
      ).rejects.toThrow('Dataset validation failed');
    });
  });

  describe('validateDataset', () => {
    it('should validate a correct dataset', () => {
      const validUpload: DatasetUpload = {
        name: 'Valid Dataset',
        description: 'A valid dataset',
        samples: [
          { input: 'Question 1', expected: 'Answer 1' },
          { input: 'Question 2', expected: 'Answer 2' },
        ],
      };

      const result = datasetService.validateDataset(validUpload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.sampleCount).toBe(2);
      expect(result.schema).toBeDefined();
    });

    it('should reject dataset with no name', () => {
      const invalidUpload: DatasetUpload = {
        name: '',
        samples: [{ input: 'test', expected: 'test' }],
      };

      const result = datasetService.validateDataset(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Dataset name is required');
    });

    it('should reject dataset with no samples', () => {
      const invalidUpload: DatasetUpload = {
        name: 'Test Dataset',
        samples: [],
      };

      const result = datasetService.validateDataset(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Dataset must contain at least one sample');
    });

    it('should reject dataset with too many samples', () => {
      const invalidUpload: DatasetUpload = {
        name: 'Large Dataset',
        samples: new Array(10001).fill({ input: 'test', expected: 'test' }),
      };

      const result = datasetService.validateDataset(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Dataset cannot contain more than 10,000 samples');
    });

    it('should infer schema from samples', () => {
      const upload: DatasetUpload = {
        name: 'Test Dataset',
        samples: [
          { input: 'string input', expected: 'string output' },
          { input: 'another string', expected: 'another output' },
        ],
      };

      const result = datasetService.validateDataset(upload);

      expect(result.schema).toEqual({
        type: 'object',
        properties: {
          input: { type: 'string' },
          expected: { type: 'string' },
        },
        required: ['input'],
      });
    });
  });

  describe('getDatasetSamples', () => {
    it('should retrieve dataset samples', async () => {
      const mockDataset = {
        id: 'dataset-123',
        storageUrl: 'dataset://samples/test-hash.json',
        name: 'Test Dataset',
        version: 'v1.0.0',
        description: '',
        schema: {},
        sampleCount: 2,
        contentHash: 'test-hash',
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      mockStorage.getDataset.mockResolvedValue(mockDataset);

      const samples = await datasetService.getDatasetSamples('dataset-123');

      expect(samples).toEqual([
        { input: 'Sample input 1', expected: 'Expected output 1' },
        { input: 'Sample input 2', expected: 'Expected output 2' },
      ]);
      expect(mockStorage.getDataset).toHaveBeenCalledWith('dataset-123');
    });

    it('should throw error if dataset not found', async () => {
      mockStorage.getDataset.mockResolvedValue(undefined);

      await expect(
        datasetService.getDatasetSamples('nonexistent-dataset')
      ).rejects.toThrow('Dataset nonexistent-dataset not found');
    });
  });

  describe('createVersion', () => {
    it('should create a new version of existing dataset', async () => {
      const existingDataset = {
        id: 'dataset-123',
        name: 'Test Dataset',
        version: 'v1.0.0',
        description: 'Original dataset',
        schema: {},
        sampleCount: 2,
        contentHash: 'original-hash',
        storageUrl: 'dataset://samples/original-hash.json',
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      const newVersion: DatasetUpload = {
        name: 'Test Dataset Updated',
        description: 'Updated dataset',
        samples: [
          { input: 'Updated input 1', expected: 'Updated output 1' },
          { input: 'Updated input 2', expected: 'Updated output 2' },
          { input: 'New input 3', expected: 'New output 3' },
        ],
      };

      mockStorage.getDataset.mockResolvedValue(existingDataset);
      mockStorage.createDataset.mockResolvedValue({
        ...existingDataset,
        id: 'dataset-456',
        version: 'v1.0.1',
        sampleCount: 3,
        contentHash: 'new-hash',
      });

      const result = await datasetService.createVersion('dataset-123', newVersion, 'user-123');

      expect(result).toBe('dataset-456');
      expect(mockStorage.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v1.0.1',
          sampleCount: 3,
        })
      );
    });

    it('should throw error if base dataset not found', async () => {
      mockStorage.getDataset.mockResolvedValue(undefined);

      const newVersion: DatasetUpload = {
        name: 'Updated Dataset',
        samples: [{ input: 'test', expected: 'test' }],
      };

      await expect(
        datasetService.createVersion('nonexistent-dataset', newVersion, 'user-123')
      ).rejects.toThrow('Dataset nonexistent-dataset not found');
    });
  });
});