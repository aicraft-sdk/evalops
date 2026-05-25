import { ApiFetcher } from '../http';
import { PolicyCheckResponse } from './runs.resource';

export class PoliciesResource {
  constructor(private readonly fetch: ApiFetcher) {}

  check(runId: string): Promise<PolicyCheckResponse> {
    return this.fetch('GET', `/api/evaluation/runs/${runId}/policy`);
  }
}
