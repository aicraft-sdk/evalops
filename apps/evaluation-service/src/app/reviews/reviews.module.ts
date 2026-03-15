import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { StorageModule } from '../storage/storage.module';
import { CoreClientModule } from '../core-client/core-client.module';

/**
 * ReviewsModule
 *
 * Handles annotations and review queue management for human-in-the-loop workflows.
 */
@Module({
  imports: [StorageModule, CoreClientModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
