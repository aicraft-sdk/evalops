import { redactPIIFromObject } from './redaction';

export interface RedactionConfig {
  redactEmail?: boolean;
  redactPhone?: boolean;
  redactSSN?: boolean;
  redactCreditCard?: boolean;
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>;
}

/**
 * Configurable multi-stage redaction pipeline.
 * All PII patterns are enabled by default.
 */
export class RedactionPipeline {
  private readonly config: Required<Omit<RedactionConfig, 'customPatterns'>> & {
    customPatterns: Array<{ pattern: RegExp; replacement: string }>;
  };

  constructor(config: RedactionConfig = {}) {
    this.config = {
      redactEmail: config.redactEmail ?? true,
      redactPhone: config.redactPhone ?? true,
      redactSSN: config.redactSSN ?? true,
      redactCreditCard: config.redactCreditCard ?? true,
      customPatterns: config.customPatterns ?? [],
    };
  }

  redact(text: string): string {
    let out = text;
    if (this.config.redactEmail)
      out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');
    if (this.config.redactPhone)
      out = out.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]');
    if (this.config.redactSSN)
      out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
    if (this.config.redactCreditCard)
      out = out.replace(/\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, '[REDACTED_CC]');
    for (const { pattern, replacement } of this.config.customPatterns) {
      out = out.replace(pattern, replacement);
    }
    return out;
  }

  redactObject(obj: unknown): unknown {
    return redactPIIFromObject(obj);
  }
}
