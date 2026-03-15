import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EvaluationClientService } from './evaluation-client.service';

@Module({
  imports: [HttpModule],
  providers: [EvaluationClientService],
  exports: [EvaluationClientService],
})
export class EvaluationClientModule {}

