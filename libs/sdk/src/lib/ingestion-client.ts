import { TraceEvent } from './trace-schema';

export interface IngestionClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number; // ms, default 30 000
}

/**
 * HTTP client for sending trace events to the evalops ingestion API.
 * Migrated from agent-evaluation/libs/sdk.
 */
export class IngestionClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;

  constructor(config: IngestionClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
  }

  /**
   * Send a batch of trace events.
   * @param events - Array of TraceEvent
   * @param idempotencyKey - Optional key for deduplication
   */
  async sendEvents(
    events: TraceEvent[],
    idempotencyKey?: string,
  ): Promise<{ success: boolean; messageId?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/ingestion/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ingestion API ${res.status}: ${body}`);
      }
      const data = await res.json();
      return { success: true, messageId: data.messageId };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Ingestion API timeout after ${this.timeout}ms`);
      }
      throw err;
    }
  }

  /**
   * Mark a run as complete and record artifact hashes.
   */
  async completeRun(
    runId: string,
    artifactHashes: Record<string, string>,
  ): Promise<{ success: boolean }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/ingestion/runs/${runId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ artifactHashes }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ingestion API ${res.status}: ${body}`);
      }
      return { success: true };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Ingestion API timeout after ${this.timeout}ms`);
      }
      throw err;
    }
  }
}
