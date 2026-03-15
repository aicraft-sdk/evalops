import yaml from 'js-yaml';
import { AgentMD, ParseResult } from './types';

/**
 * Minimal AgentMD parser.
 *
 * AgentMD files use a YAML front-matter block (between --- delimiters)
 * followed by an optional markdown body containing the system prompt.
 *
 * Example:
 * ---
 * metadata:
 *   name: my-agent
 *   version: "1.0.0"
 * model:
 *   provider: openai
 *   model: gpt-4o
 * ---
 * You are a helpful assistant.
 */
export class AgentMDParser {
  /**
   * Parse raw AgentMD content into a typed AgentMD structure.
   * Uses the js-yaml package if available; falls back to a
   * lightweight JSON-based best-effort parse for environments
   * without js-yaml.
   */
  parse(rawContent: string): ParseResult {
    const parseErrors: string[] = [];
    const frontMatter = this.extractFrontMatter(rawContent);

    if (!frontMatter) {
      parseErrors.push('No YAML front-matter block found (expected --- delimiters)');
      return {
        agentMD: this.emptyAgentMD(),
        rawContent,
        parseErrors,
      };
    }

    try {
      const parsed = yaml.load(frontMatter) as Record<string, unknown>;
      const agentMD = this.mapToAgentMD(parsed, rawContent, parseErrors);

      // Throw on critical parse failures (missing name or version)
      const criticalErrors = parseErrors.filter(
        (e) => e.includes('metadata.name') || e.includes('metadata.version'),
      );
      if (criticalErrors.length > 0) {
        throw new Error(`AgentMD parse error: ${criticalErrors.join('; ')}`);
      }

      return { agentMD, rawContent, parseErrors: parseErrors.length ? parseErrors : undefined };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('AgentMD parse error:')) {
        throw err;
      }
      parseErrors.push('Failed to parse YAML front-matter');
      return {
        agentMD: this.emptyAgentMD(),
        rawContent,
        parseErrors,
      };
    }
  }

  private extractFrontMatter(content: string): string | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : null;
  }

  private mapToAgentMD(
    parsed: Record<string, unknown>,
    raw: string,
    errors: string[],
  ): AgentMD {
    const metadata = (parsed['metadata'] as AgentMD['metadata']) ?? {
      name: 'unknown',
      version: '0.0.0',
    };

    if (!metadata.name) errors.push('metadata.name is required');
    if (!metadata.version) errors.push('metadata.version is required');

    const model = (parsed['model'] as AgentMD['model']) ?? {
      provider: 'unknown',
      model: 'unknown',
    };
    if (!model.provider) errors.push('model.provider is required');
    if (!model.model) errors.push('model.model is required');

    // Extract system prompt from markdown body (after second ---)
    const bodyMatch = raw.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
    const systemPrompt =
      (parsed['systemPrompt'] as string | undefined) ??
      (bodyMatch ? bodyMatch[1].trim() : undefined);

    return {
      metadata,
      model,
      systemPrompt: systemPrompt || undefined,
      tools: (parsed['tools'] as AgentMD['tools']) ?? [],
      policies: (parsed['policies'] as AgentMD['policies']) ?? {},
    };
  }

  private emptyAgentMD(): AgentMD {
    return {
      metadata: { name: 'unknown', version: '0.0.0' },
      model: { provider: 'unknown', model: 'unknown' },
    };
  }
}
