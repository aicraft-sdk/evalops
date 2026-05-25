import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

export async function runAgentPublish(args: string[]): Promise<void> {
  let filePath = '';

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: evalops agent publish <agent.md>',
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

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  console.log(`Publishing agent from "${filePath}"...`);
  const created = await client.agents.publishFromFile(filePath);
  console.log(`Agent published: ${created.name}${created.version ? ` v${created.version}` : ''} (id: ${created.id})`);
}
