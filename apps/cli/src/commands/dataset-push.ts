import * as path from 'path';
import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

export async function runDatasetPush(args: string[]): Promise<void> {
  let filePath = '';
  let nameOverride = '';

  for (const arg of args) {
    if (arg.startsWith('--name=')) nameOverride = arg.slice('--name='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: evalops dataset push <file.json|yaml> [--name=<override-name>]',
        '',
        'The file must have the shape:',
        '  { "name": "My Dataset", "items": [...] }',
        '',
        'Each item must match the dataset schema (input, expectedOutput, metadata).',
      ].join('\n'));
      return;
    } else if (!arg.startsWith('-')) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('Error: provide a file path. Usage: evalops dataset push <file>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  const resolved = path.resolve(filePath);
  console.log(`Pushing dataset from "${resolved}"...`);

  const created = await client.datasets.pushFromFile(resolved);
  if (nameOverride) {
    console.log(`Dataset pushed: ${nameOverride} (id: ${created.id})`);
  } else {
    console.log(`Dataset pushed: ${created.name} (id: ${created.id})`);
  }
}
