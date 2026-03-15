import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ServiceConfig {
  baseUrl: string;
  timeout?: number;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly services: Map<string, ServiceConfig>;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.services = new Map([
      [
        'auth',
        {
          baseUrl:
            this.configService.get('AUTH_SERVICE_URL') ||
            'http://localhost:3001',
          timeout: 30000,
        },
      ],
      [
        'core',
        {
          baseUrl:
            this.configService.get('CORE_SERVICE_URL') ||
            'http://localhost:3002',
          timeout: 30000,
        },
      ],
      [
        'evaluation',
        {
          baseUrl:
            this.configService.get('EVALUATION_SERVICE_URL') ||
            'http://localhost:3003',
          timeout: 60000, // Longer timeout for evaluation operations
        },
      ],
      [
        'integration',
        {
          baseUrl:
            this.configService.get('INTEGRATION_SERVICE_URL') ||
            'http://localhost:3004',
          timeout: 30000,
        },
      ],
      [
        'analytics',
        {
          baseUrl:
            this.configService.get('ANALYTICS_SERVICE_URL') ||
            'http://localhost:3005',
          timeout: 30000,
        },
      ],
    ]);
  }

  async proxyRequest(
    serviceName: string,
    path: string,
    method: string,
    body?: any,
    headers?: Record<string, string>,
  ): Promise<any> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new HttpException(
        `Service ${serviceName} not found`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Services have /api global prefix, so we need to include it
    const url = `${service.baseUrl}/api${path}`;
    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      timeout: service.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body && { data: body }),
    };

    try {
      this.logger.debug(`Proxying ${method} ${url}`);
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.request(config),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Error proxying to ${serviceName}: ${error.message}`,
        error.stack,
      );

      if (error.response) {
        // Forward the error response from the service
        throw new HttpException(
          error.response.data || error.message,
          error.response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        `Service ${serviceName} unavailable`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async checkServiceHealth(serviceName: string): Promise<boolean> {
    const service = this.services.get(serviceName);
    if (!service) {
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${service.baseUrl}/health`, {
          timeout: 5000,
        }),
      );
      return response.status === 200;
    } catch (error) {
      this.logger.warn(`Service ${serviceName} health check failed`);
      return false;
    }
  }

  getAllServices(): string[] {
    return Array.from(this.services.keys());
  }
}

