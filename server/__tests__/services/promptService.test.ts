import { promptService } from '../../services/promptService';
import { storage } from '../../storage';
import type { PromptUpload } from '../../services/promptService';

// Mock the storage module
jest.mock('../../storage');
const mockStorage = storage as jest.Mocked<typeof storage>;

describe('PromptService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadPrompt', () => {
    const mockUpload: PromptUpload = {
      name: 'Test Prompt',
      content: 'Answer the question: {input}. Be concise and accurate.',
      metadata: { category: 'qa' },
    };

    it('should upload a new prompt successfully', async () => {
      mockStorage.findPromptByContentHash.mockResolvedValue(undefined);
      mockStorage.createPrompt.mockResolvedValue({
        id: 'prompt-123',
        name: 'Test Prompt',
        version: 'v1.0.0',
        content: 'Answer the question: {input}. Be concise and accurate.',
        contentHash: expect.any(String),
        metadata: { category: 'qa' },
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      });

      const result = await promptService.uploadPrompt(mockUpload, 'user-123', 'org-123');

      expect(result).toBe('prompt-123');
      expect(mockStorage.findPromptByContentHash).toHaveBeenCalled();
      expect(mockStorage.createPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Prompt',
          version: 'v1.0.0',
          content: 'Answer the question: {input}. Be concise and accurate.',
          organizationId: 'org-123',
          createdBy: 'user-123',
        })
      );
    });

    it('should return existing prompt if content hash matches', async () => {
      const existingPrompt = {
        id: 'existing-prompt-123',
        name: 'Existing Prompt',
        version: 'v1.0.0',
        content: 'Answer the question: {input}. Be concise and accurate.',
        contentHash: 'existing-hash',
        metadata: {},
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      mockStorage.findPromptByContentHash.mockResolvedValue(existingPrompt);

      const result = await promptService.uploadPrompt(mockUpload, 'user-123', 'org-123');

      expect(result).toBe('existing-prompt-123');
      expect(mockStorage.createPrompt).not.toHaveBeenCalled();
    });

    it('should validate prompt and throw error for invalid data', async () => {
      const invalidUpload: PromptUpload = {
        name: '',
        content: '',
      };

      await expect(
        promptService.uploadPrompt(invalidUpload, 'user-123', 'org-123')
      ).rejects.toThrow('Prompt validation failed: Prompt name is required, Prompt content is required');
    });
  });

  describe('validatePrompt', () => {
    it('should validate a correct prompt', () => {
      const validUpload: PromptUpload = {
        name: 'Valid Prompt',
        content: 'Process this {input} and provide {output_format}',
      };

      const result = promptService.validatePrompt(validUpload);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.placeholders).toEqual(['input', 'output_format']);
    });

    it('should reject prompt with no name', () => {
      const invalidUpload: PromptUpload = {
        name: '',
        content: 'Some content',
      };

      const result = promptService.validatePrompt(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Prompt name is required');
    });

    it('should reject prompt with no content', () => {
      const invalidUpload: PromptUpload = {
        name: 'Test Prompt',
        content: '',
      };

      const result = promptService.validatePrompt(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Prompt content is required');
    });

    it('should reject prompt with content too long', () => {
      const invalidUpload: PromptUpload = {
        name: 'Long Prompt',
        content: 'a'.repeat(50001),
      };

      const result = promptService.validatePrompt(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Prompt content cannot exceed 50,000 characters');
    });

    it('should reject prompt with invalid placeholder format', () => {
      const invalidUpload: PromptUpload = {
        name: 'Invalid Prompt',
        content: 'Process {123invalid} and {-also-invalid}',
      };

      const result = promptService.validatePrompt(invalidUpload);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid placeholder format: {123invalid}');
      expect(result.errors).toContain('Invalid placeholder format: {-also-invalid}');
    });

    it('should extract unique placeholders correctly', () => {
      const upload: PromptUpload = {
        name: 'Test Prompt',
        content: 'Use {input} to generate {output}. The {input} should be processed carefully.',
      };

      const result = promptService.validatePrompt(upload);

      expect(result.placeholders).toEqual(['input', 'output']);
    });
  });

  describe('testPrompt', () => {
    it('should test prompt with valid input', async () => {
      const mockPrompt = {
        id: 'prompt-123',
        name: 'Test Prompt',
        version: 'v1.0.0',
        content: 'Answer the question: {question}. Use {tone} tone.',
        contentHash: 'test-hash',
        metadata: {},
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      mockStorage.getPrompt.mockResolvedValue(mockPrompt);

      const result = await promptService.testPrompt('prompt-123', {
        question: 'What is AI?',
        tone: 'friendly',
      });

      expect(result.preview).toBe('Answer the question: What is AI?. Use friendly tone.');
      expect(result.missingPlaceholders).toEqual([]);
    });

    it('should identify missing placeholders', async () => {
      const mockPrompt = {
        id: 'prompt-123',
        name: 'Test Prompt',
        version: 'v1.0.0',
        content: 'Answer {question} in {language} using {tone} tone.',
        contentHash: 'test-hash',
        metadata: {},
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      mockStorage.getPrompt.mockResolvedValue(mockPrompt);

      const result = await promptService.testPrompt('prompt-123', {
        question: 'What is AI?',
      });

      expect(result.preview).toBe('Answer What is AI? in {language} using {tone} tone.');
      expect(result.missingPlaceholders).toEqual(['language', 'tone']);
    });

    it('should throw error if prompt not found', async () => {
      mockStorage.getPrompt.mockResolvedValue(undefined);

      await expect(
        promptService.testPrompt('nonexistent-prompt', {})
      ).rejects.toThrow('Prompt nonexistent-prompt not found');
    });
  });

  describe('createVersion', () => {
    it('should create a new version of existing prompt', async () => {
      const existingPrompt = {
        id: 'prompt-123',
        name: 'Test Prompt',
        version: 'v1.0.0',
        content: 'Original content',
        contentHash: 'original-hash',
        metadata: { category: 'qa' },
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      const newVersion: PromptUpload = {
        name: 'Test Prompt Updated',
        content: 'Updated content with {new_placeholder}',
        metadata: { category: 'qa', updated: true },
      };

      mockStorage.getPrompt.mockResolvedValue(existingPrompt);
      mockStorage.createPrompt.mockResolvedValue({
        ...existingPrompt,
        id: 'prompt-456',
        version: 'v1.0.1',
        content: 'Updated content with {new_placeholder}',
        contentHash: 'new-hash',
      });

      const result = await promptService.createVersion('prompt-123', newVersion, 'user-123');

      expect(result).toBe('prompt-456');
      expect(mockStorage.createPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v1.0.1',
          content: 'Updated content with {new_placeholder}',
        })
      );
    });

    it('should throw error if base prompt not found', async () => {
      mockStorage.getPrompt.mockResolvedValue(undefined);

      const newVersion: PromptUpload = {
        name: 'Updated Prompt',
        content: 'Updated content',
      };

      await expect(
        promptService.createVersion('nonexistent-prompt', newVersion, 'user-123')
      ).rejects.toThrow('Prompt nonexistent-prompt not found');
    });
  });
});