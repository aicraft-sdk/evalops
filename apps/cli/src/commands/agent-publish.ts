import * as fs from 'fs';
import * as path from 'path';
import { ApiClient } from '../lib/api-client';
import { loadConfig, requireAuth } from '../lib/config';

function parseFrontMatter(content: string): { meta: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;
  const [, yamlBlock, body] = match;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml') as { load: (s: string) => unknown };
    return { meta: yaml.load(yamlBlock) as Record<string, unknown>, body: body.trim() };
  } catch {
    return null;
  }
}

export async function runAgentPublish(args: string[]): Promise<void> {
  let filePath = '';
  let versionOverride = '';

  for (const arg of args) {
    if (arg.startsWith('--version=')) versionOverride = arg.slice('--version='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: evalops agent publish <agent.md> [--version=<semver>]',
        '',
        'The file must use AgentMD format (YAML front-matter + system prompt body):',
        '  ---',
        '  name: my-agent',
        '  version: "1.0.0"',
        '  model:',
        '    provider: anthropic',
        '    name: claude-opus-4-7',
        '  ---',
        '  System prompt here...',
      ].join('\n'));
      return;
    } else if (!arg.startsWith('-')) {
      filePath = arg;
    }
  }

  if (!filePath) {
    console.error('Error: provide an AgentMD file path. Usage: evalops agent publish <agent.md>');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const parsed = parseFrontMatter(content);

  if (!parsed) {
    console.error('Error: file does not appear to be valid AgentMD (missing YAML front-matter).');
    console.error('Expected format: --- (yaml) --- (body)');
    process.exit(1);
  }

  const { meta, body } = parsed;

  if (!meta.name) {
    console.error('Error: AgentMD front-matter must include a "name" field.');
    process.exit(1);
  }

  const version = versionOverride || (meta.version as string) || '1.0.0';

  const config = loadConfig();
  requireAuth(config);
  const api = new ApiClient(config);

  const payload = {
    name: meta.name as string,
    version,
    description: (meta.description as string) || '',
    content,
    metadata: meta,
    systemPrompt: body,
  };

  console.log(`Publishing agent "${payload.name}" v${version}...`);
  const created = await api.post<{ id: string; name: string; version: string }>('/api/core/agents', payload);
  console.log(`✅ Agent published: ${created.name} v${created.version} (id: ${created.id})`);
}
