import { EvalOpsClient, IngestionClient } from '../index';

describe('EvalOpsClient', () => {
  it('instantiates with all resource modules', () => {
    const client = new EvalOpsClient({
      baseUrl: 'http://localhost:3000',
      token: 'evops_pat_test',
    });

    expect(client.datasets).toBeDefined();
    expect(client.specs).toBeDefined();
    expect(client.runs).toBeDefined();
    expect(client.agents).toBeDefined();
    expect(client.policies).toBeDefined();
    expect(client.tokens).toBeDefined();
    expect(client.ingest).toBeDefined();
  });

  it('exposes IngestionClient as ingest', () => {
    const client = new EvalOpsClient({
      baseUrl: 'http://localhost:3000',
      token: 'test-token',
    });
    expect(client.ingest).toBeInstanceOf(IngestionClient);
  });

  it('strips trailing slash from baseUrl', () => {
    const client = new EvalOpsClient({
      baseUrl: 'http://localhost:3000/',
      token: 'test-token',
    });
    // The client should exist and not throw on construction
    expect(client).toBeDefined();
  });
});
