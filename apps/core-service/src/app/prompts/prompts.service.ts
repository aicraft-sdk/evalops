import { Injectable, NotFoundException } from '@nestjs/common';
import { PromptsRepository } from '@evalops/shared-db';
import { TemplateEngine } from '../templates/template-engine.service';
import { InsertPrompt } from '@evalops/shared-db';
import * as crypto from 'crypto';

export interface PromptUpload {
  name: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface PromptValidationResult {
  isValid: boolean;
  errors: string[];
  placeholders: string[];
}

@Injectable()
export class PromptsService {
  constructor(
    private promptsRepository: PromptsRepository,
    private templateEngine: TemplateEngine,
  ) {}

  async uploadPrompt(
    upload: PromptUpload,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const validation = this.validatePrompt(upload);
    if (!validation.isValid) {
      throw new Error(
        `Prompt validation failed: ${validation.errors.join(', ')}`,
      );
    }

    const contentHash = this.generateContentHash(upload.content);
    const existingPrompt =
      await this.promptsRepository.findByContentHash(contentHash);
    if (existingPrompt) {
      return existingPrompt.id;
    }

    const promptData: InsertPrompt = {
      name: upload.name,
      version: 'v1.0.0',
      content: upload.content,
      contentHash,
      metadata: upload.metadata || {},
      organizationId,
      createdBy: userId,
    };

    const prompt = await this.promptsRepository.create(promptData);
    return prompt.id;
  }

  validatePrompt(upload: PromptUpload): PromptValidationResult {
    const errors: string[] = [];

    if (!upload.name || upload.name.trim().length === 0) {
      errors.push('Prompt name is required');
    }

    if (!upload.content || upload.content.trim().length === 0) {
      errors.push('Prompt content is required');
    }

    if (upload.content && upload.content.length > 50000) {
      errors.push('Prompt content cannot exceed 50,000 characters');
    }

    const placeholders = this.extractPlaceholders(upload.content || '');

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

  async testPrompt(promptId: string, testInput: Record<string, unknown>): Promise<unknown> {
    const prompt = await this.promptsRepository.findById(promptId);
    if (!prompt) {
      throw new NotFoundException(`Prompt ${promptId} not found`);
    }

    const rendered = this.templateEngine.render(prompt.content, {
      item: testInput,
      custom: testInput,
    });

    return {
      original: prompt.content,
      rendered,
      variables: this.templateEngine.extractVariables(prompt.content),
    };
  }

  private extractPlaceholders(content: string): string[] {
    const doubleBraceRegex = /\{\{([^}]+)\}\}/g;
    const singleBraceRegex = /\{([^}]+)\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = doubleBraceRegex.exec(content)) !== null) {
      const placeholder = match[1];
      if (!placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }

    while ((match = singleBraceRegex.exec(content)) !== null) {
      const placeholder = match[1];
      if (!placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }

    return placeholders;
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
