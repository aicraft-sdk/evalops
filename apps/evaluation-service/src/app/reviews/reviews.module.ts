import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { CoreClientModule } from '../core-client/core-client.module';

/**
 * ReviewsModule
 *
 * Handles annotations and review queue management for human-in-the-loop workflows.
 */
@Module({
  imports: [CoreClientModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
