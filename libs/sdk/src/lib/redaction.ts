/**
 * PII redaction helpers.
 * Migrated from agent-evaluation/libs/sdk.
 */

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_PATTERN =
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_PATTERN =
  /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g;

export function redactEmail(text: string, replacement = '[REDACTED_EMAIL]'): string {
  return text.replace(EMAIL_PATTERN, replacement);
}

export function redactPhone(text: string, replacement = '[REDACTED_PHONE]'): string {
  return text.replace(PHONE_PATTERN, replacement);
}

export function redactSSN(text: string, replacement = '[REDACTED_SSN]'): string {
  return text.replace(SSN_PATTERN, replacement);
}

export function redactCreditCard(text: string, replacement = '[REDACTED_CC]'): string {
  return text.replace(CREDIT_CARD_PATTERN, replacement);
}

/** Apply all PII redaction patterns to a string. */
export function redactPII(text: string): string {
  return redactCreditCard(redactSSN(redactPhone(redactEmail(text))));
}

/** Recursively redact PII from any value (string, object, array). */
export function redactPIIFromObject(obj: unknown): unknown {
  if (typeof obj === 'string') return redactPII(obj);
  if (Array.isArray(obj)) return obj.map(redactPIIFromObject);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = redactPIIFromObject(v);
    }
    return result;
  }
  return obj;
}
