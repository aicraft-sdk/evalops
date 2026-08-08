import { Module } from '@nestjs/common';
import { AzureModule } from './azure/azure.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { AlertsModule } from './alerts/alerts.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [AzureModule, ArtifactsModule, AlertsModule, WebhooksModule],
})
export class CoreIntegrationModule {}
