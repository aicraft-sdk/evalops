import { Module } from '@nestjs/common';
import { TraceMigrationService } from './trace-migration.service';
import { MigrationController } from './migration.controller';
import { IngestionModule } from '../ingestion/ingestion.module';
@Module({
  imports: [IngestionModule],
  controllers: [MigrationController],
  providers: [TraceMigrationService],
  exports: [TraceMigrationService],
})
export class MigrationModule {}
