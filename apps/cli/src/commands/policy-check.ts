import { ApiClient } from '../lib/api-client';
import { loadConfig, requireAuth } from '../lib/config';

interface PolicyViolation {
  policyId?: string;
  policyName?: string;
  severity: 'fail' | 'warn';
  message: string;
}

interface RunDetail {
  id: string;
  status: string;
  decision?: string;
  name?: string;
  results?: { passRate?: number };
  costUsd?: number;
  policyViolations?: PolicyViolation[];
}

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
  const api = new ApiClient(config);

  const run = await api.get<RunDetail>(`/api/evaluation/runs/${runId}`);

  const decision = run.decision ?? (run.status === 'failed' ? 'fail' : 'pending');
  const icon = decision === 'pass' ? '✅' : decision === 'warn' ? '⚠️' : decision === 'fail' ? '❌' : '⏳';
  const passRate = run.results?.passRate != null
    ? ` (pass rate: ${(run.results.passRate * 100).toFixed(1)}%)`
    : '';
  const cost = run.costUsd != null ? ` — cost: $${run.costUsd.toFixed(4)}` : '';

  console.log(`${icon} Run: ${run.name || run.id}`);
  console.log(`   Decision: ${decision.toUpperCase()}${passRate}${cost}`);
  console.log(`   Status:   ${run.status}`);

  const violations = run.policyViolations ?? [];
  if (violations.length > 0) {
    console.log('\n   Policy violations:');
    for (const v of violations) {
      const vIcon = v.severity === 'fail' ? '  ❌' : '  ⚠️';
      console.log(`${vIcon} [${v.severity.toUpperCase()}] ${v.policyName ?? v.policyId ?? 'Policy'}: ${v.message}`);
    }
  }

  if (decision === 'fail') process.exit(1);
  if (decision === 'warn') process.exit(0);
}
