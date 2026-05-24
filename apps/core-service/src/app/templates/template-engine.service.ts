import { Injectable, Logger } from '@nestjs/common';

export interface TemplateContext {
  item?: Record<string, any>;
  sample?: {
    output_text?: string;
    response?: any;
    metadata?: Record<string, any>;
  };
  evaluation?: {
    scores?: Record<string, number>;
    metrics?: Record<string, any>;
  };
  run?: {
    id?: string;
    metadata?: Record<string, any>;
  };
  custom?: Record<string, any>;
  expected?: any;
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
      } catch (error) {
        missing.push(variable);
      }
    }

    return missing;
  }

  createContext(params: {
    datasetSample?: any;
    modelResponse?: any;
    evaluationResults?: Record<string, any>;
    runMetadata?: Record<string, any>;
    customVars?: Record<string, any>;
  }): TemplateContext {
    const context: TemplateContext = {};

    if (params.datasetSample) {
      context.item = params.datasetSample;
    }

    if (params.modelResponse) {
      context.sample = {
        output_text: this.extractOutputText(params.modelResponse),
        response: params.modelResponse,
        metadata: params.modelResponse.metadata || {},
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

  private resolveProperty(context: TemplateContext, path: string): any {
    const parts = path.split('.');
    let current: any = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private extractOutputText(response: any): string {
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

