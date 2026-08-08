import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AzureBlobService } from './azure-blob.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('AzureBlobService', () => {
  function buildService(envVars: Record<string, string | undefined>): AzureBlobService {
    const configService = {
      get: <T>(key: string, defaultVal?: T): T | undefined => {
        return (envVars[key] as T) ?? defaultVal;
      },
    } as unknown as ConfigService;
    return new AzureBlobService(configService);
  }

  describe('when Azure credentials are absent', () => {
    let service: AzureBlobService;

    beforeEach(() => {
      service = buildService({});
    });

    it('should NOT throw during construction', () => {
      expect(() => buildService({})).not.toThrow();
    });

    it('isAvailable returns false', () => {
      expect(service.isAvailable).toBe(false);
    });

    it('upload throws ServiceUnavailableException', async () => {
      await expect(
        service.uploadArtifact('run-1', 'output.json', 'content'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('download throws ServiceUnavailableException', async () => {
      await expect(
        service.downloadBlobContent('run-1/output.json'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('generatePresignedUrl throws ServiceUnavailableException', async () => {
      await expect(
        service.generatePresignedUrl('run-1/output.json'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('deleteArtifact throws ServiceUnavailableException', async () => {
      await expect(
        service.deleteArtifact('run-1/output.json'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('when connection string is provided', () => {
    it('isAvailable returns true', () => {
      const service = buildService({
        AZURE_STORAGE_CONNECTION_STRING:
          'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net',
      });
      expect(service.isAvailable).toBe(true);
    });
  });

  describe('when account name + key are provided', () => {
    it('isAvailable returns true', () => {
      const service = buildService({
        AZURE_STORAGE_ACCOUNT_NAME: 'myaccount',
        AZURE_STORAGE_ACCOUNT_KEY: 'dGVzdGtleWZvcm1vY2t0ZXN0aW5nMTIzNDU2Nzg5MA==',
      });
      expect(service.isAvailable).toBe(true);
    });
  });
});
