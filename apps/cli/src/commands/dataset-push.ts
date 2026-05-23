import * as fs from 'fs';
import * as path from 'path';
import { ApiClient } from '../lib/api-client';
import { loadConfig, requireAuth } from '../lib/config';

interface DatasetPayload {
  name?: string;
  description?: string;
  samples: unknown[];
}

export async function runDatasetPush(args: string[]): Promise<void> {
  let filePath = '';
  let nameOverride = '';

  for (const arg of args) {
    if (arg.startsWith('--name=')) nameOverride = arg.slice('--name='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: evalops dataset push <file.json> [--name=<override-name>]',
        '',
        'The JSON file must have the shape:',
        '  { "name": "My Dataset", "samples": [...] }',
        '',
        'Each sample must match the dataset schema (input, expectedOutput, metadata).',
      ].join('\n'));
      return;
    } else if (!arg.startsWith('-')) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('Error: provide a JSON file path. Usage: evalops dataset push <file.json>');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  let payload: DatasetPayload;
  try {
    payload = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch {
    console.error(`Invalid JSON in ${resolved}`);
    process.exit(1);
  }

  if (!Array.isArray(payload.samples)) {
    console.error('Error: JSON must contain a "samples" array.');
    process.exit(1);
  }

  if (nameOverride) payload.name = nameOverride;
  if (!payload.name) payload.name = path.basename(filePath, path.extname(filePath));

  const config = loadConfig();
  requireAuth(config);
  const api = new ApiClient(config);

  console.log(`Pushing dataset "${payload.name}" (${payload.samples.length} samples)...`);
  const created = await api.post<{ id: string; name: string }>('/api/core/datasets', payload);
  console.log(`✅ Dataset created: ${created.name} (id: ${created.id})`);
}
