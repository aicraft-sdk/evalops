import { Module } from '@nestjs/common';
import { ArtifactsController } from './artifacts.controller';
import { AzureBlobService } from '../storage/azure-blob.service';
import { ServiceAuthGuard } from '@evalops/shared-auth';

@Module({
  controllers: [ArtifactsController],
  providers: [AzureBlobService, ServiceAuthGuard],
  exports: [AzureBlobService],
})
export class ArtifactsModule {}
