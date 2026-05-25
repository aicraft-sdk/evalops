import { existsSync } from 'fs';
import { resolve } from 'path';
import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

export async function runSpecPush(args: string[]): Promise<void> {
  const filePath = args.find(a => !a.startsWith('-'));

  if (!filePath || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: evalops spec push <spec.yaml>');
    if (!filePath) process.exit(1);
    return;
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  // CRITICAL-5: check file existence before SDK call to give user-friendly error
  if (!existsSync(filePath)) {
    console.error(`Spec file not found: ${resolve(filePath)}`);
    process.exit(1);
  }

  console.log(`Upserting spec from "${filePath}"...`);
  const spec = await client.specs.upsertFromYaml(filePath);
  console.log(`Spec upserted: ${spec.id} (${spec.name})`);
}

export async function runSpecList(): Promise<void> {
  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  const specs = await client.specs.list();
  if (specs.length === 0) {
    console.log('No eval specs found.');
    return;
  }

  console.log('');
  console.log('ID                                   NAME                   CREATED');
  console.log('--------------------------------------------------------------------');
  for (const s of specs) {
    const created = s['createdAt'] ? new Date(String(s['createdAt'])).toLocaleDateString() : 'unknown';
    console.log(`${s.id.padEnd(37)} ${s.name.padEnd(22)} ${created}`);
  }
  console.log('');
}
