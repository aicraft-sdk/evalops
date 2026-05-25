import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

export async function runRunGet(args: string[]): Promise<void> {
  let runId = '';
  let asJson = false;

  for (const arg of args) {
    if (arg === '--json') asJson = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: evalops run get <id> [--json]');
      return;
    } else if (!arg.startsWith('-')) {
      runId = arg;
    }
  }

  if (!runId) {
    console.error('Error: provide a run ID. Usage: evalops run get <id>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  const run = await client.runs.get(runId);

  if (asJson) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }

  const decision = run.decision ?? 'pending';
  const icon = decision === 'pass' ? '[PASS]' : decision === 'warn' ? '[WARN]' : decision === 'fail' ? '[FAIL]' : '[...]';

  console.log('');
  console.log(`${icon} Run: ${(run['name'] as string | undefined) || run.id}`);
  console.log(`   ID:       ${run.id}`);
  console.log(`   Status:   ${run.status}`);
  console.log(`   Decision: ${decision.toUpperCase()}`);
  if (run['createdAt']) console.log(`   Created:  ${String(run['createdAt'])}`);
  console.log('');
}
