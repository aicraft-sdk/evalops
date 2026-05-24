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
import { DatasetsRepository } from '@evalops/shared-db';

@Controller('datasets')
export class DatasetsController {
  constructor(
    private datasetsService: DatasetsService,
    private datasetsRepository: DatasetsRepository,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getDatasets(@CurrentUser() user: { organizationId: string }) {
    return this.datasetsRepository.findAllByOrg(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getDataset(@Param('id') id: string) {
    return this.datasetsRepository.findById(id);
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
    @CurrentUser() user: { id: string; organizationId: string },
  ) {
    const datasetId = await this.datasetsService.uploadDataset(
      body,
      user.id,
      user.organizationId,
    );
    return this.datasetsRepository.findById(datasetId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateDataset(
    @Param('id') id: string,
    @Body() body: Partial<DatasetUpload>,
  ) {
    return this.datasetsRepository.update(id, {
      ...body,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteDataset(@Param('id') id: string) {
    await this.datasetsRepository.delete(id);
    return { message: 'Dataset deleted successfully' };
  }
}
