import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob';

/**
 * Azure Blob Storage service for run artifact persistence.
 *
 * Required env vars:
 *   AZURE_STORAGE_ACCOUNT_NAME
 *   AZURE_STORAGE_CONTAINER_NAME
 *   AZURE_STORAGE_CONNECTION_STRING  (OR account key via AZURE_STORAGE_ACCOUNT_KEY)
 */
@Injectable()
export class AzureBlobService {
  private readonly logger = new Logger(AzureBlobService.name);
  private readonly client: BlobServiceClient;
  private readonly containerName: string;
  private readonly accountName: string;
  private readonly accountKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'AZURE_STORAGE_CONNECTION_STRING',
    );
    this.accountName = this.configService.get<string>(
      'AZURE_STORAGE_ACCOUNT_NAME',
      '',
    );
    this.accountKey = this.configService.get<string>('AZURE_STORAGE_ACCOUNT_KEY');
    this.containerName = this.configService.get<string>(
      'AZURE_STORAGE_CONTAINER_NAME',
      'evalops-artifacts',
    );

    if (connectionString) {
      this.client = BlobServiceClient.fromConnectionString(connectionString);
    } else if (this.accountName && this.accountKey) {
      const credential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey,
      );
      this.client = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        credential,
      );
    } else {
      throw new Error(
        'Azure Blob Storage requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY',
      );
    }
  }

  /**
   * Uploads artifact content to Azure Blob Storage.
   * @returns The blob URL (without SAS token — use generatePresignedUrl for downloads)
   */
  async uploadArtifact(
    runId: string,
    fileName: string,
    content: Buffer | string,
  ): Promise<string> {
    const blobPath = `${runId}/${fileName}`;
    const containerClient = this.client.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: this.inferContentType(fileName) },
    });

    this.logger.log(`Uploaded artifact: ${blobPath}`);
    return blockBlobClient.url;
  }

  /**
   * Generates a time-limited SAS (presigned) URL for downloading a blob.
   */
  async generatePresignedUrl(
    blobPath: string,
    expiryMinutes = 60,
  ): Promise<string> {
    if (!this.accountKey) {
      throw new Error(
        'SAS URL generation requires AZURE_STORAGE_ACCOUNT_KEY',
      );
    }

    const credential = new StorageSharedKeyCredential(
      this.accountName,
      this.accountKey,
    );

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiryMinutes * 60 * 1000);

    const sasQueryParams = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
      },
      credential,
    );

    return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobPath}?${sasQueryParams.toString()}`;
  }

  /**
   * Downloads blob content as a string.
   */
  async downloadBlobContent(blobPath: string): Promise<string> {
    const containerClient = this.client.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      throw new NotFoundException(`Blob not found: ${blobPath}`);
    }

    const downloadResponse = await blockBlobClient.download(0);
    const content = await this.streamToString(
      downloadResponse.readableStreamBody,
    );

    this.logger.debug(`Downloaded blob content: ${blobPath} (${content.length} bytes)`);
    return content;
  }

  /**
   * Helper to convert stream to string
   */
  private async streamToString(
    readableStream: NodeJS.ReadableStream | undefined,
  ): Promise<string> {
    if (!readableStream) {
      throw new Error('Readable stream is undefined');
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      readableStream.on('error', reject);
    });
  }

  /**
   * Deletes a blob from Azure Blob Storage.
   */
  async deleteArtifact(blobPath: string): Promise<void> {
    const containerClient = this.client.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      throw new NotFoundException(`Artifact not found: ${blobPath}`);
    }

    await blockBlobClient.delete();
    this.logger.log(`Deleted artifact: ${blobPath}`);
  }

  private inferContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      json: 'application/json',
      txt: 'text/plain',
      csv: 'text/csv',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };
    return types[ext ?? ''] ?? 'application/octet-stream';
  }
}
