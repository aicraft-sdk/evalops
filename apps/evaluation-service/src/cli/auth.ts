/**
 * Authentication helpers for CLI commands
 *
 * Supports both JWT token authentication (for user auth) and service token
 * authentication (for CI environments).
 */

export interface AuthConfig {
  apiKey?: string; // JWT token (from EVALOPS_API_KEY env var)
  serviceToken?: string; // Service token (from EVALOPS_SERVICE_TOKEN env var)
  apiUrl?: string; // Base API URL (from EVALOPS_API_URL env var, default: http://localhost:3000)
}

/**
 * Get authentication configuration from environment variables
 */
export function getAuthConfig(): AuthConfig {
  const apiKey = process.env.EVALOPS_API_KEY;
  const serviceToken = process.env.EVALOPS_SERVICE_TOKEN;
  const apiUrl = process.env.EVALOPS_API_URL || 'http://localhost:3000';

  return {
    apiKey,
    serviceToken,
    apiUrl,
  };
}

/**
 * Get HTTP headers for authenticated requests
 */
export function getAuthHeaders(config?: AuthConfig): Record<string, string> {
  const authConfig = config || getAuthConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Prefer JWT token if available
  if (authConfig.apiKey) {
    headers['Authorization'] = `Bearer ${authConfig.apiKey}`;
  } else if (authConfig.serviceToken) {
    headers['X-Service-Token'] = authConfig.serviceToken;
  } else {
    throw new Error(
      'Authentication required: Set EVALOPS_API_KEY (JWT) or EVALOPS_SERVICE_TOKEN (service token)'
    );
  }

  return headers;
}

/**
 * Validate that authentication is configured
 */
export function validateAuth(config?: AuthConfig): void {
  const authConfig = config || getAuthConfig();

  if (!authConfig.apiKey && !authConfig.serviceToken) {
    throw new Error(
      'Authentication required: Set EVALOPS_API_KEY (JWT) or EVALOPS_SERVICE_TOKEN (service token)'
    );
  }
}
