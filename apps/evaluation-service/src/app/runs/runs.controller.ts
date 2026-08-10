import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { RunsService } from './runs.service';
import { JwtAuthGuard, CurrentUser, AuthenticatedUser } from '@evalops/shared-auth';
import { InsertRun } from '@evalops/shared-db';
import { extractTokenFromRequest } from '@evalops/shared-common';

@Controller('runs')
export class RunsController {
  constructor(private runsService: RunsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.runsService.getRuns(
      user.organizationId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getRun(@Param('id') id: string) {
    return this.runsService.getRun(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createRun(
    @Body() body: InsertRun,
    @CurrentUser() user: AuthenticatedUser,
    @Request() req: ExpressRequest,
  ) {
    const token = extractTokenFromRequest(req);
    return this.runsService.createRun(
      {
        ...body,
        organizationId: user.organizationId,
        triggeredBy: user.id,
        status: 'pending',
      },
      token,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async cancelRun(@Param('id') id: string) {
    return this.runsService.cancelRun(id);
  }
}

