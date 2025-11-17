import crypto from 'crypto';
import { storage } from '../storage';
import type { InsertPrompt } from '@shared/schema';

export interface PromptUpload {
  name: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface PromptValidationResult {
  isValid: boolean;
  errors: string[];
  placeholders: string[];
}

class PromptService {
  async uploadPrompt(
    upload: PromptUpload,
    userId: string,
    organizationId: string
  ): Promise<string> {
    // Validate prompt
    const validation = this.validatePrompt(upload);
    if (!validation.isValid) {
      throw new Error(`Prompt validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate content hash for deduplication
    const contentHash = this.generateContentHash(upload.content);
    
    // Check if prompt with same content already exists
    const existingPrompt = await storage.findPromptByContentHash(contentHash);
    if (existingPrompt) {
      return existingPrompt.id;
    }

    // Create prompt record
    const promptData: InsertPrompt = {
      name: upload.name,
      version: 'v1.0.0',
      content: upload.content,
      contentHash,
      metadata: upload.metadata || {},
      organizationId,
      createdBy: userId,
    };

    const prompt = await storage.createPrompt(promptData);
    return prompt.id;
  }

  validatePrompt(upload: PromptUpload): PromptValidationResult {
    const errors: string[] = [];

    // Check basic requirements
    if (!upload.name || upload.name.trim().length === 0) {
      errors.push('Prompt name is required');
    }

    if (!upload.content || upload.content.trim().length === 0) {
      errors.push('Prompt content is required');
    }

    if (upload.content && upload.content.length > 50000) {
      errors.push('Prompt content cannot exceed 50,000 characters');
    }

    // Extract placeholders
    const placeholders = this.extractPlaceholders(upload.content || '');

    // Validate placeholder format
    for (const placeholder of placeholders) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(placeholder)) {
        errors.push(`Invalid placeholder format: {${placeholder}}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      placeholders,
    };
  }

  private extractPlaceholders(content: string): string[] {
    // Support both {{variable}} and {variable} formats
    const doubleBraceRegex = /\{\{([^}]+)\}\}/g;
    const singleBraceRegex = /\{([^}]+)\}/g;
    const placeholders: string[] = [];
    let match;

    // First, extract double braces {{variable}}
    while ((match = doubleBraceRegex.exec(content)) !== null) {
      const placeholder = match[1];
      if (!placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }

    // Reset regex for single braces, but avoid matching parts of double braces
    const contentWithoutDoubleBraces = content.replace(/\{\{([^}]+)\}\}/g, '');
    while ((match = singleBraceRegex.exec(contentWithoutDoubleBraces)) !== null) {
      const placeholder = match[1];
      if (!placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }

    return placeholders;
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  async createVersion(
    promptId: string,
    upload: PromptUpload,
    userId: string
  ): Promise<string> {
    const existingPrompt = await storage.getPrompt(promptId);
    if (!existingPrompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    // Generate new version
    const versionParts = existingPrompt.version.split('.');
    const major = parseInt(versionParts[0]?.substring(1) || '1');
    const minor = parseInt(versionParts[1] || '0');
    const patch = parseInt(versionParts[2] || '0');
    
    const newVersion = `v${major}.${minor}.${patch + 1}`;
    
    // Validate new version
    const validation = this.validatePrompt(upload);
    if (!validation.isValid) {
      throw new Error(`Prompt validation failed: ${validation.errors.join(', ')}`);
    }

    const contentHash = this.generateContentHash(upload.content);

    const promptData: InsertPrompt = {
      name: upload.name,
      version: newVersion,
      content: upload.content,
      contentHash,
      metadata: upload.metadata || existingPrompt.metadata,
      organizationId: existingPrompt.organizationId,
      createdBy: userId,
    };

    const newPrompt = await storage.createPrompt(promptData);
    return newPrompt.id;
  }

  async testPrompt(
    promptId: string,
    testInput: Record<string, any>
  ): Promise<{ preview: string; missingPlaceholders: string[] }> {
    const prompt = await storage.getPrompt(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    const validation = this.validatePrompt({ name: prompt.name, content: prompt.content });
    const requiredPlaceholders = validation.placeholders;
    const providedPlaceholders = Object.keys(testInput);
    
    const missingPlaceholders = requiredPlaceholders.filter(
      placeholder => !providedPlaceholders.includes(placeholder)
    );

    let preview = prompt.content;
    
    // Replace available placeholders
    for (const [key, value] of Object.entries(testInput)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      preview = preview.replace(regex, String(value));
    }

    return {
      preview,
      missingPlaceholders,
    };
  }
}

export const promptService = new PromptService();