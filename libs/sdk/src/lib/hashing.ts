import { createHash } from 'crypto';

/**
 * Hash content using SHA-256.
 * @param content - String or Buffer to hash
 * @returns Hex-encoded SHA-256 digest
 */
export function hashContent(content: string | Buffer): string {
  const h = createHash('sha256');
  if (typeof content === 'string') {
    h.update(content, 'utf8');
  } else {
    h.update(content);
  }
  return h.digest('hex');
}

/**
 * Hash an object via stable JSON serialisation (keys sorted).
 */
export function hashObject(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  return hashContent(json);
}

/**
 * Alias for hashContent — communicates intent for artifact immutability checks.
 */
export function hashArtifact(content: string | Buffer): string {
  return hashContent(content);
}
