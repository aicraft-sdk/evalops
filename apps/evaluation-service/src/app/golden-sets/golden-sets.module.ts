import { Module } from '@nestjs/common';
import { EvaluatorsModule } from '../evaluation/evaluators/evaluators.module';
import { GoldenSetsController } from './golden-sets.controller';
import { GoldenSetsService } from './golden-sets.service';
import { CalibrationService } from '../evaluation/calibration/calibration.service';

@Module({
  imports: [EvaluatorsModule], // exports EvaluatorsService, which CalibrationService requires
  controllers: [GoldenSetsController],
  providers: [GoldenSetsService, CalibrationService],
})
export class GoldenSetsModule {}
