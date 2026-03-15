import { Module } from '@nestjs/common';
import { EvalSpecsController } from './eval-specs.controller';
import { EvalSpecsService } from './eval-specs.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [EvalSpecsController],
  providers: [EvalSpecsService],
  exports: [EvalSpecsService],
})
export class EvalSpecsModule {}

