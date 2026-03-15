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
import { DatasetsService, DatasetUpload } from './datasets.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { DatabaseStorageService } from '../storage/database-storage.service';

@Controller('datasets')
export class DatasetsController {
  constructor(
    private datasetsService: DatasetsService,
    private storageService: DatabaseStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getDatasets(@CurrentUser() user: any) {
    return this.storageService.getDatasets(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getDataset(@Param('id') id: string) {
    return this.storageService.getDataset(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/samples')
  async getDatasetSamples(@Param('id') id: string) {
    return this.datasetsService.getDatasetSamples(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createDataset(
    @Body() body: DatasetUpload,
    @CurrentUser() user: any,
  ) {
    const datasetId = await this.datasetsService.uploadDataset(
      body,
      user.id,
      user.organizationId,
    );
    return this.storageService.getDataset(datasetId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateDataset(
    @Param('id') id: string,
    @Body() body: Partial<DatasetUpload>,
  ) {
    return this.storageService.updateDataset(id, {
      ...body,
      updatedAt: new Date(),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteDataset(@Param('id') id: string) {
    await this.storageService.deleteDataset(id);
    return { message: 'Dataset deleted successfully' };
  }
}

