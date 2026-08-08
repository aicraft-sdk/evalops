import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { AzureBlobService } from '../storage/azure-blob.service';
import { ServiceAuthGuard } from '@evalops/shared-auth';

@Controller('artifacts')
export class ArtifactsController {
  private readonly logger = new Logger(ArtifactsController.name);

  constructor(private readonly blobService: AzureBlobService) {}

  /**
   * GET /artifacts/:runId/:fileName
   * Redirects to a presigned Azure Blob URL (60-minute expiry).
   */
  @Get(':runId/:fileName')
  async getArtifact(
    @Param('runId') runId: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ): Promise<void> {
    const blobPath = `${runId}/${fileName}`;
    const presignedUrl = await this.blobService.generatePresignedUrl(blobPath, 60);
    res.redirect(presignedUrl);
  }

  /**
   * POST /artifacts/:runId/notify
   * Internal endpoint — called by evaluation-service when a run completes.
   * Protected by ServiceAuthGuard (requires X-Service-Token header).
   */
  @Post(':runId/notify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceAuthGuard)
  async notifyRunComplete(
    @Param('runId') runId: string,
    @Body() body: { artifactHashes: Record<string, string> },
  ): Promise<{ acknowledged: boolean }> {
    const fileCount = Object.keys(body.artifactHashes ?? {}).length;
    this.logger.log(
      `Run ${runId} completed with ${fileCount} artifact(s). Hashes: ${JSON.stringify(body.artifactHashes)}`,
    );
    return { acknowledged: true };
  }

  /**
   * DELETE /artifacts/:runId/:fileName
   * Deletes a specific artifact blob.
   */
  @Delete(':runId/:fileName')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteArtifact(
    @Param('runId') runId: string,
    @Param('fileName') fileName: string,
  ): Promise<void> {
    const blobPath = `${runId}/${fileName}`;
    await this.blobService.deleteArtifact(blobPath);
  }

  /**
   * GET /artifacts/blob/:blobPath
   * Internal endpoint — downloads blob content as string.
   * Protected by ServiceAuthGuard (requires X-Service-Token header).
   * Used by evaluation-service to retrieve evaluator code.
   */
  @Get('blob/*blobPath')
  @UseGuards(ServiceAuthGuard)
  @ApiExcludeEndpoint() // cf:shortcut: named-wildcard route isn't parseable by @nestjs/swagger's route validator; excluding from Swagger scan avoids a bootstrap crash without changing live Express route-matching behavior
  async getBlobContent(
    @Param('blobPath') blobPath: string | string[],
  ): Promise<{ content: string }> {
    // path-to-regexp v7+ named wildcards (`*blobPath`) yield an array of path
    // segments instead of the old single-string `(*)` capture — rejoin to preserve behavior.
    const path = Array.isArray(blobPath) ? blobPath.join('/') : blobPath;
    this.logger.debug(`Downloading blob content: ${path}`);
    const content = await this.blobService.downloadBlobContent(path);
    return { content };
  }
}
