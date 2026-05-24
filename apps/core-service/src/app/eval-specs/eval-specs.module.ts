import { Module } from '@nestjs/common';
import { EvalSpecsController } from './eval-specs.controller';
import { EvalSpecsService } from './eval-specs.service';

@Module({
  imports: [],
  controllers: [EvalSpecsController],
  providers: [EvalSpecsService],
  exports: [EvalSpecsService],
})
export class EvalSpecsModule {}
