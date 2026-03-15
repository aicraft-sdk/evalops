import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PromptsService, PromptUpload } from './prompts.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { DatabaseStorageService } from '../storage/database-storage.service';

@Controller('prompts')
export class PromptsController {
  constructor(
    private promptsService: PromptsService,
    private storageService: DatabaseStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPrompts(@CurrentUser() user: any) {
    return this.storageService.getPrompts(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getPrompt(@Param('id') id: string) {
    return this.storageService.getPrompt(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createPrompt(
    @Body() body: PromptUpload,
    @CurrentUser() user: any,
  ) {
    const promptId = await this.promptsService.uploadPrompt(
      body,
      user.id,
      user.organizationId,
    );
    return this.storageService.getPrompt(promptId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/test')
  async testPrompt(
    @Param('id') id: string,
    @Body() testInput: Record<string, any>,
  ) {
    return this.promptsService.testPrompt(id, testInput);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updatePrompt(
    @Param('id') id: string,
    @Body() body: Partial<PromptUpload>,
    @CurrentUser() user: any,
  ) {
    return this.storageService.updatePrompt(id, {
      ...body,
      updatedAt: new Date(),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deletePrompt(@Param('id') id: string) {
    await this.storageService.deletePrompt(id);
    return { message: 'Prompt deleted successfully' };
  }
}

