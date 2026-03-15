import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

interface WebhookJob {
  url: string;
  payload: any;
}

@Processor('webhook-delivery')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private webhooksService: WebhooksService) {}

  @Process('deliver')
  async handleWebhookDelivery(job: Job<WebhookJob>) {
    const { url, payload } = job.data;

    this.logger.log(`Processing webhook delivery to ${url} (attempt ${job.attemptsMade + 1})`);

    try {
      await this.webhooksService.deliverWebhook(url, payload);
      this.logger.log(`Successfully delivered webhook to ${url}`);
    } catch (error: any) {
      this.logger.error(`Failed to deliver webhook to ${url}:`, error.message);
      throw error; // Re-throw to trigger retry
    }
  }
}

