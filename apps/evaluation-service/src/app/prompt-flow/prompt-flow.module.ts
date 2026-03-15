import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PromptFlowService } from './prompt-flow.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [PromptFlowService],
  exports: [PromptFlowService],
})
export class PromptFlowModule {}

