import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ModelsService } from './models.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { InsertModel } from '@evalops/shared-db';

@Controller('models')
export class ModelsController {
  constructor(private modelsService: ModelsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getModels(@Query('providerId') providerId?: string) {
    return this.modelsService.getAllModels(providerId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getModel(@Param('id') id: string) {
    return this.modelsService.getModel(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createModel(
    @Body() body: InsertModel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @CurrentUser() user: any,
  ) {
    // Check if user is admin (basic check - can be enhanced with proper permission system)
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can create models');
    }
    return this.modelsService.createModel(body);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateModel(
    @Param('id') id: string,
    @Body() body: Partial<InsertModel>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @CurrentUser() user: any,
  ) {
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can update models');
    }
    return this.modelsService.updateModel(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async deleteModel(@Param('id') id: string, @CurrentUser() user: any) {
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete models');
    }
    return this.modelsService.deleteModel(id);
  }
}




