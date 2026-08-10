import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TemplateEngine, TemplateContext } from './template-engine.service';
import { JwtAuthGuard } from '@evalops/shared-auth';

@Controller('templates')
export class TemplatesController {
  constructor(private templateEngine: TemplateEngine) {}

  @UseGuards(JwtAuthGuard)
  @Post('render')
  async render(@Body() body: { template: string; context: TemplateContext }) {
    const rendered = this.templateEngine.render(body.template, body.context);
    return { rendered };
  }
}
