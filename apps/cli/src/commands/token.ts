import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

export async function runTokenCreate(args: string[]): Promise<void> {
  let name = '';
  let ttlDays = 90;
  let scopes: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--name=')) name = arg.slice('--name='.length);
    else if (arg.startsWith('--ttl=')) ttlDays = parseInt(arg.slice('--ttl='.length), 10);
    else if (arg.startsWith('--scopes=')) scopes = arg.slice('--scopes='.length).split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: evalops token create --name <label> [--ttl <days>] [--scopes <csv>]');
      return;
    }
  }

  if (!name) {
    console.error('Error: --name is required. Usage: evalops token create --name <label>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  // HIGH-4: wrap create in try/catch with contextual message
  try {
    const resp = await client.tokens.create({ name, ttlDays, scopes });
    console.log(`Token created (shown once): ${resp.token ?? '(token value not returned by server)'}`);
    console.log(`ID: ${resp.id}`);
    console.log(`Name: ${resp.name}`);
    if (resp.expiresAt) console.log(`Expires: ${resp.expiresAt}`);
  } catch (err) {
    console.error(`Token creation failed: ${(err as Error).message}`);
    console.error('Ensure you are logged in and have the required scope.');
    process.exit(1);
  }
}

export async function runTokenList(): Promise<void> {
  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  // HIGH-4: wrap list in try/catch
  try {
    const tokens = await client.tokens.list();
    if (tokens.length === 0) {
      console.log('No tokens found.');
      return;
    }

    console.log('');
    console.log('ID                                   NAME                   EXPIRES');
    console.log('--------------------------------------------------------------------');
    for (const t of tokens) {
      const expires = t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'never';
      console.log(`${t.id.padEnd(37)} ${t.name.padEnd(22)} ${expires}`);
    }
    console.log('');
  } catch (err) {
    console.error(`Failed to list tokens: ${(err as Error).message}`);
    console.error('Ensure you are logged in and the server is reachable.');
    process.exit(1);
  }
}

export async function runTokenRevoke(args: string[]): Promise<void> {
  const id = args.find(a => !a.startsWith('-'));
  if (!id) {
    console.error('Error: provide a token ID. Usage: evalops token revoke <id>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  // HIGH-4: wrap revoke in try/catch
  try {
    await client.tokens.revoke(id);
    console.log(`Token ${id} revoked.`);
  } catch (err) {
    console.error(`Failed to revoke token ${id}: ${(err as Error).message}`);
    console.error('Ensure the token ID is correct and you are authenticated.');
    process.exit(1);
  }
}
