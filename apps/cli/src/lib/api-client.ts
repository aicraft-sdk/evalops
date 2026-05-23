import axios, { AxiosInstance, AxiosError } from 'axios';
import type { CliConfig } from './config';

export class ApiClient {
  private http: AxiosInstance;

  constructor(config: CliConfig) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
    else if (config.serviceToken) headers['X-Service-Token'] = config.serviceToken;

    this.http = axios.create({ baseURL: config.apiUrl, headers });
  }

  async get<T = unknown>(urlPath: string): Promise<T> {
    return this.call<T>(() => this.http.get<T>(urlPath));
  }

  async post<T = unknown>(urlPath: string, body?: unknown): Promise<T> {
    return this.call<T>(() => this.http.post<T>(urlPath, body));
  }

  async postForm<T = unknown>(urlPath: string, form: FormData): Promise<T> {
    return this.call<T>(() =>
      this.http.post<T>(urlPath, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    );
  }

  private async call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
    try {
      const { data } = await fn();
      return data;
    } catch (err) {
      const axErr = err as AxiosError<{ message?: string }>;
      const msg = axErr.response?.data?.message ?? axErr.message;
      const status = axErr.response?.status;
      throw new Error(status ? `HTTP ${status}: ${msg}` : msg);
    }
  }
}
