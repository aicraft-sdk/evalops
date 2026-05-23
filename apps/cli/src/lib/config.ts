import { loadCredentials } from './credentials';

export interface CliConfig {
  apiUrl: string;
  apiKey?: string;
  serviceToken?: string;
}

export function loadConfig(): CliConfig {
  const envApiUrl = process.env.EVALOPS_API_URL;
  const envApiKey = process.env.EVALOPS_API_KEY;
  const envServiceToken = process.env.EVALOPS_SERVICE_TOKEN;

  if (envApiKey || envServiceToken) {
    return {
      apiUrl: envApiUrl || 'http://localhost:3000',
      apiKey: envApiKey,
      serviceToken: envServiceToken,
    };
  }

  const creds = loadCredentials();
  if (creds) {
    return { apiUrl: envApiUrl || creds.apiUrl, apiKey: creds.apiKey };
  }

  return { apiUrl: envApiUrl || 'http://localhost:3000' };
}

export function requireAuth(config: CliConfig): asserts config is CliConfig & { apiKey: string } {
  if (!config.apiKey && !config.serviceToken) {
    console.error('Not authenticated. Run `evalops login` or set EVALOPS_API_KEY.');
    process.exit(1);
  }
}
