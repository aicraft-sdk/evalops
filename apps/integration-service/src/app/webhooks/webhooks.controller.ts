import {
  Controller,
  Post,
  Body,
  Headers,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { Public } from '@evalops/shared-auth';
import { CurrentUser } from '@evalops/shared-auth';
import { DatabaseStorageService } from '../storage/database-storage.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private webhooksService: WebhooksService,
    private storageService: DatabaseStorageService,
  ) {}

  @Public()
  @Post('github/:integrationId')
  async receiveGitHubWebhook(
    @Param('integrationId') integrationId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    const signature = headers['x-hub-signature-256'] || headers['x-hub-signature'];
    const event = headers['x-github-event'];

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    // Fetch integration from database to get secret and organization
    const integration = await this.storageService.getCicdIntegrationById(
      integrationId,
    );
    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    if (!integration.isActive) {
      throw new BadRequestException(`Integration ${integrationId} is not active`);
    }

    // Get webhook secret from integration
    const secret = integration.webhookSecret || '';

    if (secret) {
      const payload = JSON.stringify(body);
      const isValid = this.webhooksService.verifyGitHubSignature(
        payload,
        signature,
        secret,
      );

      if (!isValid) {
        throw new BadRequestException('Invalid webhook signature');
      }
    } else {
      // Log warning if no secret is configured
      console.warn(
        `No webhook secret configured for integration ${integrationId}`,
      );
    }

    // Get organization ID from integration
    const organizationId = integration.organizationId;

    // Process based on event type
    switch (event) {
      case 'push':
        await this.webhooksService.processPushWebhook(
          integrationId,
          body,
          organizationId,
        );
        break;

      case 'pull_request':
        await this.webhooksService.processPullRequestWebhook(
          integrationId,
          body,
          organizationId,
        );
        break;

      default:
        // Log unhandled events (logger is private in service)
        console.log(`Unhandled GitHub event: ${event}`);
    }

    return { received: true, event };
  }

  @Post('deliver')
  async deliverWebhook(
    @Body() body: { url: string; payload: any },
    @CurrentUser() user: any,
  ) {
    await this.webhooksService.deliverWebhook(body.url, body.payload);
    return { delivered: true };
  }
}
