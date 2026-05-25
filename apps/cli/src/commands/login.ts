import * as readline from 'readline';
import { hostname } from 'os';
import { EvalOpsClient } from '@evalops/sdk';
import { saveCredentials } from '../lib/credentials';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

export async function runLogin(args: string[]): Promise<void> {
  let apiUrl = 'http://localhost:3000';
  let emailArg = '';

  for (const arg of args) {
    if (arg.startsWith('--url=')) apiUrl = arg.slice('--url='.length);
    else if (arg.startsWith('--email=')) emailArg = arg.slice('--email='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: evalops login [--url=<api-url>] [--email=<email>]');
      console.log('       Password is read from EVALOPS_PASSWORD env var or prompted interactively.');
      return;
    }
  }

  // Read environment overrides
  apiUrl = process.env['EVALOPS_API_URL'] || apiUrl;

  // CRITICAL-1: password must NOT come from CLI args (process-list exposure)
  // Read from EVALOPS_PASSWORD env var first, then prompt interactively.
  const envPassword = process.env['EVALOPS_PASSWORD'];

  const email = emailArg || process.env['EVALOPS_USERNAME'] || await prompt('Email: ');

  let password: string;
  if (envPassword) {
    password = envPassword;
  } else if (process.stdin.isTTY) {
    password = await prompt('Password: ');
  } else {
    console.error('Error: Set EVALOPS_PASSWORD environment variable or pass it interactively.');
    process.exit(1);
  }

  // Step 1: Password login → get JWT
  const loginResp = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!loginResp.ok) {
    const body = await loginResp.json().catch(() => ({ message: loginResp.statusText })) as { message?: string };
    console.error(`Login failed: ${body.message ?? loginResp.statusText}`);
    process.exit(1);
  }

  const loginData = await loginResp.json() as { access_token: string };
  const jwt = loginData.access_token;

  // Step 2: Mint a PAT using the JWT (long-lived token for CLI use)
  const jwtClient = new EvalOpsClient({ baseUrl: apiUrl, token: jwt });
  let pat: string;
  try {
    const tokenResp = await jwtClient.tokens.create({
      name: `cli-${hostname()}`,
      ttlDays: 90,
      scopes: [],
    });
    pat = tokenResp.token ?? jwt;
  } catch {
    // CRITICAL-4: warn user that we fell back to the short-lived JWT
    console.warn('\nWarning: PAT minting failed — stored a short-lived session token (~1h).');
    console.warn('Re-run `evalops login` once the /api/auth/tokens endpoint is available.');
    pat = jwt;
  }

  saveCredentials({ token: pat, apiUrl });
  console.log('Logged in. Token stored at ~/.evalops/credentials.json');
  console.log(`API URL: ${apiUrl}`);
}
