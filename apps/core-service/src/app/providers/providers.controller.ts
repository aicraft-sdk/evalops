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
import { ProvidersService } from './providers.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { InsertAiProvider } from '@evalops/shared-db';

@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getProviders() {
    return this.providersService.getAllProviders();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getProvider(@Param('id') id: string) {
    return this.providersService.getProvider(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createProvider(
    @Body() body: InsertAiProvider,
    @CurrentUser() user: any,
  ) {
    // Check if user is admin (basic check - can be enhanced with proper permission system)
    if (user.role !== 'admin') {
      throw new Error('Only admins can create providers');
    }
    return this.providersService.createProvider(body);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateProvider(
    @Param('id') id: string,
    @Body() body: Partial<InsertAiProvider>,
    @CurrentUser() user: any,
  ) {
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new Error('Only admins can update providers');
    }
    return this.providersService.updateProvider(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteProvider(@Param('id') id: string, @CurrentUser() user: any) {
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new Error('Only admins can delete providers');
    }
    return this.providersService.deleteProvider(id);
  }
}




