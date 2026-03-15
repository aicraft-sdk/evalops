/**
 * Unit tests for IngestionClient.
 * Mocks the global fetch to avoid real HTTP calls.
 */
import { IngestionClient } from '../ingestion-client';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const BASE_URL = 'https://eval.example.com';
const API_KEY = 'test-api-key-123';

describe('IngestionClient', () => {
  let client: IngestionClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new IngestionClient({ baseUrl: BASE_URL, apiKey: API_KEY });
  });

  describe('sendEvents', () => {
    it('sends a POST request to /ingestion/events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, messageId: 'msg_1' }),
      });

      const event = {
        runId: 'run-1',
        agentId: 'agent-1',
        agentVersion: '1.0.0',
        datasetId: 'ds-1',
        datasetVersion: '1',
        events: [],
        toolCalls: [],
        timings: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 100 },
        tokens: { input: 10, output: 20, total: 30 },
        cost: 0.001,
      };

      const result = await client.sendEvents([event]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/ingestion/events');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe(`Bearer ${API_KEY}`);
      expect(result.success).toBe(true);
    });

    it('forwards the idempotency key as a header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await client.sendEvents([], 'idem-key-abc');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Idempotency-Key']).toBe('idem-key-abc');
    });

    it('returns success: false on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      });

      const result = await client.sendEvents([]);
      expect(result.success).toBe(false);
    });
  });

  describe('completeRun', () => {
    it('sends a POST to /ingestion/runs/:id/complete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await client.completeRun('run-123', { 'output.json': 'abc123' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/ingestion/runs/run-123/complete');
      expect(options.method).toBe('POST');
      expect(result.success).toBe(true);
    });
  });
});
