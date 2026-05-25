import { loadConfig } from '../lib/config';
import { loadCredentials } from '../lib/credentials';

export function runWhoami(): void {
  const creds = loadCredentials();
  const config = loadConfig();

  if (!config.token && !config.serviceToken) {
    console.log('Not logged in. Run `evalops login` to authenticate.');
    process.exit(1);
  }

  const token = config.token ?? config.serviceToken ?? '';
  const tokenPreview = token.length > 16
    ? `${token.slice(0, 16)}...`
    : token;

  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Token:   ${tokenPreview}`);

  if (creds) {
    console.log(`Source:  ~/.evalops/credentials.json`);
  } else {
    console.log(`Source:  environment variable`);
  }
}
