import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { withTenantContext } from '@evalops/shared-db';
import { WebhooksService } from './webhooks.service';

interface WebhookJob {
  url: string;
  payload: unknown;
  organizationId?: string;
}

@Processor('webhook-delivery')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private webhooksService: WebhooksService) {}

  @Process('deliver')
  async handleWebhookDelivery(job: Job<WebhookJob>) {
    const { url, payload, organizationId } = job.data;
    const orgId = organizationId ?? '';

    this.logger.log(`Processing webhook delivery to ${url} (attempt ${job.attemptsMade + 1})`);

    try {
      await withTenantContext({ orgId, userId: '', role: '' }, () =>
        this.webhooksService.deliverWebhook(url, payload as Parameters<WebhooksService['deliverWebhook']>[1])
      );
      this.logger.log(`Successfully delivered webhook to ${url}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to deliver webhook to ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to trigger retry
    }
  }
}
