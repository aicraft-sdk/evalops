import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AzureController } from './azure.controller';
import { AzureDiscoveryService } from './azure-discovery.service';
import { AzureMLService } from './azure-ml.service';
import { AzureOpenAIService } from './azure-openai.service';
import { HttpModule } from '@nestjs/axios';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [HttpModule, ConfigModule, StorageModule],
  controllers: [AzureController],
  providers: [AzureDiscoveryService, AzureMLService, AzureOpenAIService],
  exports: [AzureDiscoveryService, AzureMLService, AzureOpenAIService],
})
export class AzureModule {}

