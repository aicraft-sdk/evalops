import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplateEngine } from './template-engine.service';

@Module({
  controllers: [TemplatesController],
  providers: [TemplateEngine],
  exports: [TemplateEngine],
})
export class TemplatesModule {}

