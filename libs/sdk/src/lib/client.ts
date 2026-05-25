import { IngestionClient } from './ingestion-client';
import { makeFetcher } from './http';
import { DatasetsResource } from './resources/datasets.resource';
import { SpecsResource } from './resources/specs.resource';
import { RunsResource } from './resources/runs.resource';
import { AgentsResource } from './resources/agents.resource';
import { PoliciesResource } from './resources/policies.resource';
import { TokensResource } from './resources/tokens.resource';

export interface EvalOpsClientConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
}

/**
 * Full-featured EvalOps API client.
 *
 * @example
 * ```ts
 * const client = new EvalOpsClient({ baseUrl: 'http://localhost:3000', token: process.env.EVALOPS_TOKEN! });
 * const spec = await client.specs.upsertFromYaml('./evals/my.eval.yaml');
 * const run  = await client.runs.create({ evalSpecId: spec.id });
 * const done = await client.runs.waitFor(run.id, { timeoutMs: 60_000 });
 * if (done.decision === 'fail') process.exit(1);
 * ```
 */
export class EvalOpsClient {
  readonly datasets: DatasetsResource;
  readonly specs: SpecsResource;
  readonly runs: RunsResource;
  readonly agents: AgentsResource;
  readonly policies: PoliciesResource;
  readonly tokens: TokensResource;
  readonly ingest: IngestionClient;

  constructor(config: EvalOpsClientConfig) {
    const base = config.baseUrl.replace(/\/$/, '');
    const timeout = config.timeout ?? 30_000;
    const fetcher = makeFetcher(
      base,
      {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      timeout,
    );

    this.datasets = new DatasetsResource(fetcher);
    this.specs = new SpecsResource(fetcher);
    this.runs = new RunsResource(fetcher);
    this.agents = new AgentsResource(fetcher);
    this.policies = new PoliciesResource(fetcher);
    this.tokens = new TokensResource(fetcher);
    this.ingest = new IngestionClient({ baseUrl: base, apiKey: config.token, timeout });
  }
}
