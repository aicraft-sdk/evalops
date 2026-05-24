import { Injectable } from '@nestjs/common';
import {
  ExactEvaluator,
  RuleEvaluator,
  type EvaluationContext,
  type EvaluationResult,
  type ExactEvaluatorConfig,
  type RuleEvaluatorConfig,
} from '@evalops/evaluators';
import { type EvaluatorConfig } from './evaluators.service';

/**
 * Deterministic evaluators: exact-match, schema validity, JSON validity.
 * No AI calls; pure computation.
 */
@Injectable()
export class EvaluatorsDeterministicService {
  evaluateExactMatchTyped(
    context: EvaluationContext,
    config?: ExactEvaluatorConfig,
  ): EvaluationResult {
    return new ExactEvaluator(config).evaluate(context);
  }

  evaluateRuleTyped(
    context: EvaluationContext,
    config?: RuleEvaluatorConfig,
  ): EvaluationResult {
    return new RuleEvaluator(config).evaluate(context);
  }

  evaluateExactMatch(
    response: string,
    expected: string,
    config?: EvaluatorConfig,
  ): number {
    if (!expected || !response) return 0;

    const strictness = config?.strictness || 'moderate';
    const similarity = this.calculateSimilarity(response, expected, strictness);

    const thresholds: Record<string, number> = {
      strict: 0.95,
      moderate: 0.8,
      lenient: 0.6,
      semantic: 0.7,
    };

    const threshold = thresholds[strictness] || thresholds.moderate;
    return similarity >= threshold ? similarity : 0;
  }

  evaluateSchemaValidity(
    response: unknown,
    schema: Record<string, unknown>,
  ): number {
    try {
      if (typeof response === 'object' && response !== null) {
        return this.validateSchema(response as Record<string, unknown>, schema)
          ? 1
          : 0;
      }
      return 0;
    } catch (e: unknown) {
      return 0;
    }
  }

  evaluateJsonValidity(response: string, config?: EvaluatorConfig): number {
    try {
      JSON.parse(response);
      if (!config?.schema) return 1;

      const parsed = JSON.parse(response);
      return this.validateSchema(parsed, config.schema) ? 1 : 0;
    } catch (e: unknown) {
      return 0;
    }
  }

  private calculateSimilarity(
    response: string,
    expected: string,
    strictness: string,
  ): number {
    const resp = response.trim().toLowerCase();
    const exp = expected.trim().toLowerCase();

    switch (strictness) {
      case 'strict':
        return resp === exp ? 1.0 : 0;
      case 'moderate':
        return this.levenshteinSimilarity(
          this.normalizeText(resp),
          this.normalizeText(exp),
        );
      case 'lenient':
        return this.tokenSimilarity(resp, exp);
      case 'semantic':
        return this.semanticSimilarity(resp, exp);
      default:
        return this.levenshteinSimilarity(resp, exp);
    }
  }

  private normalizeText(text: string): string {
    return text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private levenshteinSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private tokenSimilarity(response: string, expected: string): number {
    const respTokens = new Set(
      response.split(/\s+/).filter((t) => t.length > 2),
    );
    const expTokens = new Set(
      expected.split(/\s+/).filter((t) => t.length > 2),
    );

    if (expTokens.size === 0) return 1.0;

    const intersection = new Set(
      Array.from(respTokens).filter((x) => expTokens.has(x)),
    );
    return intersection.size / expTokens.size;
  }

  private semanticSimilarity(response: string, expected: string): number {
    const respTokens = this.extractConcepts(response);
    const expTokens = this.extractConcepts(expected);

    if (expTokens.length === 0) return 1.0;

    let matches = 0;
    for (const expToken of expTokens) {
      if (respTokens.some((respToken) => this.conceptsMatch(respToken, expToken))) {
        matches++;
      }
    }

    return matches / expTokens.length;
  }

  private extractConcepts(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3 && !this.isStopWord(word));
  }

  private conceptsMatch(word1: string, word2: string): boolean {
    if (word1 === word2) return true;
    const stem1 = this.simpleStem(word1);
    const stem2 = this.simpleStem(word2);
    return stem1 === stem2;
  }

  private simpleStem(word: string): string {
    return word
      .replace(/(ing|ed|er|est|ly|tion|ness)$/, '')
      .replace(/(ies)$/, 'y')
      .replace(/(s)$/, '');
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    ]);
    return stopWords.has(word.toLowerCase());
  }

  private validateSchema(
    data: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): boolean {
    if (schema['type'] === 'object' && typeof data === 'object') {
      const required = schema['required'];
      if (Array.isArray(required)) {
        for (const field of required) {
          if (!(field in data)) return false;
        }
      }
      return true;
    }
    return typeof data === schema['type'];
  }
}
