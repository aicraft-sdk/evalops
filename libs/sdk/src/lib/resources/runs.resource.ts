import { ApiFetcher } from '../http';

export interface RunResponse {
  id: string;
  status: string;
  decision?: string | null;
  [key: string]: unknown;
}

export interface PolicyCheckResponse {
  decision: string;
  violations?: Array<{ policyName: string; severity: string; message: string }>;
  [key: string]: unknown;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const POLL_INTERVAL_MS = 2_000;

export class RunsResource {
  constructor(private readonly fetch: ApiFetcher) {}

  create(data: { evalSpecId: string; [key: string]: unknown }): Promise<RunResponse> {
    return this.fetch('POST', '/api/evaluation/runs', data);
  }

  get(id: string): Promise<RunResponse> {
    return this.fetch('GET', `/api/evaluation/runs/${id}`);
  }

  async waitFor(
    id: string,
    options?: { timeoutMs?: number },
  ): Promise<RunResponse> {
    const timeoutMs = options?.timeoutMs ?? 600_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const run = await this.get(id);
      if (TERMINAL_STATUSES.has(run.status)) {
        return run;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)),
      );
    }

    throw new Error(`Run ${id} did not complete within ${timeoutMs}ms`);
  }

  policy(runId: string): Promise<PolicyCheckResponse> {
    return this.fetch('GET', `/api/evaluation/runs/${runId}/policy`);
  }
}
