import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

export async function runPolicyCheck(args: string[]): Promise<void> {
  let runId = '';

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: evalops policy check <run-id>');
      return;
    } else if (!arg.startsWith('-')) {
      runId = arg;
    }
  }

  if (!runId) {
    console.error('Error: provide a run ID. Usage: evalops policy check <run-id>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  const run = await client.runs.get(runId);
  const policyResult = await client.runs.policy(runId);

  const decision = policyResult.decision ?? run.decision ?? 'pending';
  const icon = decision === 'pass' ? '[PASS]' : decision === 'warn' ? '[WARN]' : decision === 'fail' ? '[FAIL]' : '[...]';

  console.log(`${icon} Run: ${(run['name'] as string | undefined) || run.id}`);
  console.log(`   Decision: ${decision.toUpperCase()}`);
  console.log(`   Status:   ${run.status}`);

  const violations = policyResult.violations ?? [];
  if (violations.length > 0) {
    console.log('\n   Policy violations:');
    for (const v of violations) {
      const vIcon = v.severity === 'fail' ? '  [FAIL]' : '  [WARN]';
      console.log(`${vIcon} [${v.severity.toUpperCase()}] ${v.policyName}: ${v.message}`);
    }
  }

  if (decision === 'fail') process.exit(1);
}
