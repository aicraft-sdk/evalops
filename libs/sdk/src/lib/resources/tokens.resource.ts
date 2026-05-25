import { ApiFetcher } from '../http';

export interface TokenResponse {
  id: string;
  name: string;
  scopes: string[];
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt?: string;
  token?: string; // present only on creation
}

export class TokensResource {
  constructor(private readonly fetch: ApiFetcher) {}

  create(data: {
    name: string;
    ttlDays?: number;
    scopes?: string[];
  }): Promise<TokenResponse> {
    return this.fetch('POST', '/api/auth/tokens', data);
  }

  list(): Promise<TokenResponse[]> {
    return this.fetch('GET', '/api/auth/tokens');
  }

  revoke(id: string): Promise<void> {
    return this.fetch('DELETE', `/api/auth/tokens/${id}`);
  }
}
