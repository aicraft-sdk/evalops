import { Test } from '@nestjs/testing';

// Mock @evalops/shared-db so this test does not require a real Postgres connection.
// webhook.processor.ts calls withTenantContext() directly (a free function, not DI-injected),
// so module-level mocking is required to isolate at the DI/mock boundary — same pattern as
// libs/shared-common/src/lib/interceptors/org-context.interceptor.spec.ts.
jest.mock('@evalops/shared-db', () => ({
  withTenantContext: jest
    .fn()
    .mockImplementation(
      (_ctx: { orgId: string; userId: string; role: string }, fn: () => unknown) => Promise.resolve(fn()),
    ),
}));

import { WebhooksService } from './webhooks.service';
import { WebhookProcessor } from './webhook.processor';

describe('webhook-delivery queue contract', () => {
  it('processes a job published via WebhooksService.queueWebhookDelivery', async () => {
    const deliverWebhook = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        { provide: WebhooksService, useValue: { deliverWebhook } },
      ],
    }).compile();

    const processor = moduleRef.get(WebhookProcessor);
    const job = {
      data: { url: 'https://example.test/hook', payload: { ok: true }, organizationId: 'org-1' },
      attemptsMade: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await processor.handleWebhookDelivery(job);

    expect(deliverWebhook).toHaveBeenCalledWith(
      'https://example.test/hook',
      { ok: true },
    );
  });

  it('re-throws on delivery failure so Bull retries per the configured backoff', async () => {
    const deliverWebhook = jest.fn().mockRejectedValue(new Error('network error'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        { provide: WebhooksService, useValue: { deliverWebhook } },
      ],
    }).compile();

    const processor = moduleRef.get(WebhookProcessor);
    const job = {
      data: { url: 'https://example.test/hook', payload: {}, organizationId: '' },
      attemptsMade: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(processor.handleWebhookDelivery(job)).rejects.toThrow('network error');
  });

  it('locks in current behavior: a job with missing organizationId still delivers under an empty-string tenant context (no rejection)', async () => {
    const deliverWebhook = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        { provide: WebhooksService, useValue: { deliverWebhook } },
      ],
    }).compile();

    const processor = moduleRef.get(WebhookProcessor);
    const job = {
      data: { url: 'https://example.test/hook', payload: { ok: true } }, // organizationId omitted
      attemptsMade: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Documents existing behavior (webhook.processor.ts: `const orgId = organizationId ?? '';`):
    // a missing organizationId does NOT fail loudly — delivery proceeds under an empty-string
    // tenant context. This test does not assert this is desirable, only that it is current.
    await expect(processor.handleWebhookDelivery(job)).resolves.toBeUndefined();
    expect(deliverWebhook).toHaveBeenCalledWith(
      'https://example.test/hook',
      { ok: true },
    );
  });
});
