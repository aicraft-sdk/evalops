import { loadCredentials } from './credentials';

export interface CliConfig {
  apiUrl: string;
  token?: string;
  serviceToken?: string;
}

export function loadConfig(): CliConfig {
  const envApiUrl = process.env['EVALOPS_API_URL'];
  // Support both EVALOPS_API_KEY (legacy) and EVALOPS_TOKEN (new)
  const envToken = process.env['EVALOPS_TOKEN'] || process.env['EVALOPS_API_KEY'];
  const envServiceToken = process.env['EVALOPS_SERVICE_TOKEN'];

  if (envToken || envServiceToken) {
    return {
      apiUrl: envApiUrl || 'http://localhost:3000',
      token: envToken,
      serviceToken: envServiceToken,
    };
  }

  const creds = loadCredentials();
  if (creds) {
    return { apiUrl: envApiUrl || creds.apiUrl, token: creds.token };
  }

  return { apiUrl: envApiUrl || 'http://localhost:3000' };
}

export function requireAuth(config: CliConfig): asserts config is CliConfig & { token: string } {
  if (!config.token) {
    if (config.serviceToken) {
      // CRITICAL-2: copy serviceToken → token so the type assertion holds at runtime
      // and all downstream code using config.token gets a defined value
      (config as { token: string }).token = config.serviceToken;
      return;
    }
    console.error('Not authenticated. Run `evalops login` or set EVALOPS_TOKEN.');
    process.exit(1);
  }
}
