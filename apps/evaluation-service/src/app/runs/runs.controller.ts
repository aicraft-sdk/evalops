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
import { RunsService } from './runs.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { InsertRun } from '@evalops/shared-db';
import { extractTokenFromRequest } from '@evalops/shared-common';

@Controller('runs')
export class RunsController {
  constructor(private runsService: RunsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getRuns(
    @CurrentUser() user: any,
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
    @CurrentUser() user: any,
    @Request() req: any,
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

