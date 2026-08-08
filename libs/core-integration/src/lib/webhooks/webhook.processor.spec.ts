import { Test } from '@nestjs/testing';
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
});
