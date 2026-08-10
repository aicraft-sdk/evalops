import { Injectable, Logger } from '@nestjs/common';

/** Shape of a model/AI-provider response used to derive output text and metadata. */
export interface ModelResponseObject {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  text?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TemplateContext {
  item?: Record<string, unknown>;
  sample?: {
    output_text?: string;
    response?: unknown;
    metadata?: Record<string, unknown>;
  };
  evaluation?: {
    scores?: Record<string, number>;
    metrics?: Record<string, unknown>;
  };
  run?: {
    id?: string;
    metadata?: Record<string, unknown>;
  };
  custom?: Record<string, unknown>;
  expected?: unknown;
}

@Injectable()
export class TemplateEngine {
  private readonly logger = new Logger(TemplateEngine.name);
  private readonly VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

  render(template: string, context: TemplateContext): string {
    if (!template) return '';

    return template.replace(this.VARIABLE_REGEX, (match, variable) => {
      const trimmedVar = variable.trim();

      try {
        const value = this.resolveProperty(context, trimmedVar);

        if (value === null || value === undefined) {
          this.logger.warn(
            `Template variable '${trimmedVar}' resolved to null/undefined`,
          );
          return '';
        }

        if (typeof value === 'object') {
          return JSON.stringify(value);
        }

        return String(value);
      } catch (error) {
        this.logger.warn(
          `Failed to resolve template variable '${trimmedVar}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return `{{${trimmedVar}}}`;
      }
    });
  }

  extractVariables(template: string): string[] {
    if (!template) return [];

    const variables: string[] = [];
    let match;
    const regex = new RegExp(this.VARIABLE_REGEX.source, 'g');

    while ((match = regex.exec(template)) !== null) {
      const variable = match[1]?.trim();
      if (variable && !variables.includes(variable)) {
        variables.push(variable);
      }
    }

    return variables;
  }

  validateTemplate(template: string, context: TemplateContext): string[] {
    const variables = this.extractVariables(template);
    const missing: string[] = [];

    for (const variable of variables) {
      try {
        const value = this.resolveProperty(context, variable);
        if (value === null || value === undefined) {
          missing.push(variable);
        }
      } catch {
        missing.push(variable);
      }
    }

    return missing;
  }

  createContext(params: {
    datasetSample?: Record<string, unknown>;
    modelResponse?: string | ModelResponseObject | null;
    evaluationResults?: {
      scores?: Record<string, number>;
      metrics?: Record<string, unknown>;
    };
    runMetadata?: { id?: string; [key: string]: unknown };
    customVars?: Record<string, unknown>;
  }): TemplateContext {
    const context: TemplateContext = {};

    if (params.datasetSample) {
      context.item = params.datasetSample;
    }

    if (params.modelResponse) {
      context.sample = {
        output_text: this.extractOutputText(params.modelResponse),
        response: params.modelResponse,
        metadata:
          (typeof params.modelResponse === 'object' &&
            params.modelResponse?.metadata) ||
          {},
      };
    }

    if (params.evaluationResults) {
      context.evaluation = {
        scores: params.evaluationResults.scores || {},
        metrics: params.evaluationResults.metrics || {},
      };
    }

    if (params.runMetadata) {
      context.run = {
        id: params.runMetadata.id,
        metadata: params.runMetadata,
      };
    }

    if (params.customVars) {
      context.custom = params.customVars;
    }

    return context;
  }

  private resolveProperty(context: TemplateContext, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private extractOutputText(
    response: string | ModelResponseObject | null | undefined,
  ): string {
    if (typeof response === 'string') {
      return response;
    }

    if (response?.choices?.[0]?.message?.content) {
      return response.choices[0].message.content;
    }

    if (response?.output_text) {
      return response.output_text;
    }

    if (response?.text) {
      return response.text;
    }

    if (response?.content) {
      return response.content;
    }

    if (typeof response === 'object') {
      return JSON.stringify(response);
    }

    return String(response || '');
  }
}
