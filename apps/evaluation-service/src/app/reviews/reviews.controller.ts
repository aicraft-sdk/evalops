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
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard, CurrentUser, AuthenticatedUser } from '@evalops/shared-auth';
import { InsertRunAnnotation, InsertReviewQueueItem } from '@evalops/shared-db';
import { extractTokenFromRequest } from '@evalops/shared-common';

interface QueueItemFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  sourceType?: string;
  tags?: string[];
}

@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  // ========== Annotation Endpoints ==========

  @UseGuards(JwtAuthGuard)
  @Post('annotations')
  async createAnnotation(
    @Body() body: Omit<InsertRunAnnotation, 'organizationId' | 'authorId'>,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.createAnnotation(
      body,
      user.organizationId,
      user.id
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('annotations')
  async listAnnotations(
    @Query('runId') runId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('spanId') spanId?: string
  ) {
    if (!runId) {
      throw new Error('runId query parameter is required');
    }
    return this.reviewsService.getAnnotationsForRun(
      runId,
      user.organizationId,
      spanId
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('annotations/:id')
  async getAnnotation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.getAnnotation(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('annotations/:id')
  async updateAnnotation(
    @Param('id') id: string,
    @Body() body: Partial<InsertRunAnnotation>,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.updateAnnotation(id, body, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('annotations/:id')
  async deleteAnnotation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    await this.reviewsService.deleteAnnotation(id, user.organizationId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('runs/:runId/annotations')
  async getRunAnnotations(
    @Param('runId') runId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('spanId') spanId?: string
  ) {
    return this.reviewsService.getAnnotationsForRun(
      runId,
      user.organizationId,
      spanId
    );
  }

  // ========== Review Queue Endpoints ==========

  @UseGuards(JwtAuthGuard)
  @Get('queue')
  async listQueueItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('tags') tags?: string,
    @Query('limit') limit?: string
  ) {
    const filters: QueueItemFilters = {};
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (assigneeId) filters.assigneeId = assigneeId;
    if (sourceType) filters.sourceType = sourceType;
    if (tags) {
      filters.tags = tags.split(',').map((t) => t.trim());
    }

    return this.reviewsService.getQueueItems(
      user.organizationId,
      Object.keys(filters).length > 0 ? filters : undefined,
      limit ? parseInt(limit, 10) : undefined
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('queue')
  async createQueueItem(
    @Body() body: Omit<InsertReviewQueueItem, 'organizationId' | 'createdBy'>,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.createQueueItem(
      body,
      user.organizationId,
      user.id
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('queue/:id')
  async getQueueItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.getQueueItem(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('queue/:id')
  async updateQueueItem(
    @Param('id') id: string,
    @Body() body: Partial<InsertReviewQueueItem>,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.updateQueueItem(id, body, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('queue/:id/promote-to-dataset')
  async promoteToDataset(
    @Param('id') id: string,
    @Body()
    body: {
      datasetId?: string;
      datasetName?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
    @Request() req: ExpressRequest
  ) {
    const token = extractTokenFromRequest(req);
    return this.reviewsService.promoteToDataset(
      id,
      body.datasetId || null,
      body.datasetName || null,
      user.organizationId,
      token
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('queue/:id/promote-to-scenario')
  async promoteToScenario(
    @Param('id') id: string,
    @Body()
    body: {
      suiteId: string;
      scenarioId?: string;
      scenarioName?: string;
    },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.reviewsService.promoteToScenario(
      id,
      body.suiteId,
      body.scenarioId || null,
      body.scenarioName || null,
      user.organizationId
    );
  }
}
