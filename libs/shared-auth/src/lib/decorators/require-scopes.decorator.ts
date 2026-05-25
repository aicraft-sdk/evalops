import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'required_scopes';

/**
 * Marks a route as requiring specific PAT scopes.
 * JWT-authenticated requests bypass scope checks (RBAC governs access instead).
 * PAT-authenticated requests must have all listed scopes.
 */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(SCOPES_KEY, scopes);
