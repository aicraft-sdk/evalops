import { Module, forwardRef } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [forwardRef(() => ReviewsModule)],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
