import { Module } from '@nestjs/common';
import { AzureModule } from './azure/azure.module';
import { ArtifactsModule } from './artifacts/artifacts.module';

@Module({
  imports: [AzureModule, ArtifactsModule],
})
export class CoreIntegrationModule {}
