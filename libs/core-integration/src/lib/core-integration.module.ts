import { Module } from '@nestjs/common';
import { AzureModule } from './azure/azure.module';

@Module({
  imports: [AzureModule],
})
export class CoreIntegrationModule {}
