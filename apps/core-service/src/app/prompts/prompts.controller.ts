import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PromptsService, PromptUpload } from './prompts.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { PromptsRepository } from '@evalops/shared-db';

@Controller('prompts')
export class PromptsController {
  constructor(
    private promptsService: PromptsService,
    private promptsRepository: PromptsRepository,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPrompts(@CurrentUser() user: { organizationId: string }) {
    return this.promptsRepository.findAllByOrg(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getPrompt(@Param('id') id: string) {
    return this.promptsRepository.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createPrompt(
    @Body() body: PromptUpload,
    @CurrentUser() user: { id: string; organizationId: string },
  ) {
    const promptId = await this.promptsService.uploadPrompt(
      body,
      user.id,
      user.organizationId,
    );
    return this.promptsRepository.findById(promptId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/test')
  async testPrompt(
    @Param('id') id: string,
    @Body() testInput: Record<string, unknown>,
  ) {
    return this.promptsService.testPrompt(id, testInput);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updatePrompt(
    @Param('id') id: string,
    @Body() body: Partial<PromptUpload>,
  ) {
    return this.promptsRepository.update(id, {
      ...body,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deletePrompt(@Param('id') id: string) {
    await this.promptsRepository.delete(id);
    return { message: 'Prompt deleted successfully' };
  }
}
