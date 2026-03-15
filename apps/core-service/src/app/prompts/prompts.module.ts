import { Module } from '@nestjs/common';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';
import { StorageModule } from '../storage/storage.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [StorageModule, TemplatesModule],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}

