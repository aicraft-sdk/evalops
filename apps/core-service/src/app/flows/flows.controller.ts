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
import { FlowsRepository } from '@evalops/shared-db';
import { flows } from '@evalops/shared-db';

@Controller('flows')
export class FlowsController {
  constructor(
    private flowsService: FlowsService,
    private flowsRepository: FlowsRepository,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getFlows(@CurrentUser() user: { organizationId: string }) {
    return this.flowsRepository.findAllByOrg(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFlow(@Param('id') id: string) {
    return this.flowsRepository.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createFlow(
    @Body() body: typeof flows.$inferInsert,
    @CurrentUser() user: { id: string; organizationId: string },
  ) {
    return this.flowsService.createFlow({
      ...body,
      organizationId: user.organizationId,
      createdBy: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateFlow(
    @Param('id') id: string,
    @Body() body: Partial<typeof flows.$inferInsert>,
  ) {
    return this.flowsService.updateFlow(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteFlow(@Param('id') id: string) {
    await this.flowsService.deleteFlow(id);
    return { message: 'Flow deleted successfully' };
  }
}
