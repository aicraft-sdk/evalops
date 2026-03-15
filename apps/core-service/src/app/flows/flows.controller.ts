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
import { FlowsService } from './flows.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { InsertFlow } from '@evalops/shared-db';

@Controller('flows')
export class FlowsController {
  constructor(
    private flowsService: FlowsService,
    private storageService: DatabaseStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getFlows(@CurrentUser() user: any) {
    return this.storageService.getFlows(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFlow(@Param('id') id: string) {
    return this.storageService.getFlow(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createFlow(@Body() body: InsertFlow, @CurrentUser() user: any) {
    return this.flowsService.createFlow({
      ...body,
      organizationId: user.organizationId,
      createdBy: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateFlow(@Param('id') id: string, @Body() body: Partial<InsertFlow>) {
    return this.flowsService.updateFlow(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteFlow(@Param('id') id: string) {
    await this.flowsService.deleteFlow(id);
    return { message: 'Flow deleted successfully' };
  }
}

