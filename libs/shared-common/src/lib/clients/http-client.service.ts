import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class HttpClientService {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  /**
   * Appends the X-Service-Token header for service-to-service calls.
   */
  private addServiceAuth(config?: AxiosRequestConfig): AxiosRequestConfig {
    const serviceSecret = this.configService.get<string>('SERVICE_SECRET');
    if (!serviceSecret) return config ?? {};
    return {
      ...config,
      headers: {
        ...(config?.headers ?? {}),
        'X-Service-Token': serviceSecret,
      },
    };
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await firstValueFrom(this.httpService.get(url, config));
    return response.data;
  }

  async post<T, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.httpService.post(url, data, config),
    );
    return response.data;
  }

  async put<T, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.httpService.put(url, data, config),
    );
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await firstValueFrom(
      this.httpService.delete(url, config),
    );
    return response.data;
  }
}

