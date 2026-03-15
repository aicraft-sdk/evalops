import { Module } from '@nestjs/common';
import { TraceMigrationService } from './trace-migration.service';
import { MigrationController } from './migration.controller';
import { IngestionModule } from '../ingestion/ingestion.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [IngestionModule, StorageModule],
  controllers: [MigrationController],
  providers: [TraceMigrationService],
  exports: [TraceMigrationService],
})
export class MigrationModule {}
