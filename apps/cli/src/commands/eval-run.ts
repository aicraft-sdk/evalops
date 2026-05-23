import { ApiClient } from '../lib/api-client';
import { loadConfig, requireAuth } from '../lib/config';

interface RunResult {
  id: string;
  status: string;
  decision?: string;
  name?: string;
  duration?: number;
  results?: { passRate?: number };
  costUsd?: number;
}

async function pollRun(api: ApiClient, runId: string, timeoutMs = 600_000): Promise<RunResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await api.get<RunResult>(`/api/evaluation/runs/${runId}`);
    if (run.status === 'completed' || run.status === 'failed') return run;
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Run ${runId} timed out after ${timeoutMs / 1000}s`);
}

export async function runEvalRun(args: string[]): Promise<void> {
  let specName = '';
  let specId = '';
  let watch = false;

  for (const arg of args) {
    if (arg.startsWith('--spec-id=')) specId = arg.slice('--spec-id='.length);
    else if (arg.startsWith('--spec-name=') || arg.startsWith('--spec=')) specName = arg.split('=')[1];
    else if (arg === '--watch' || arg === '-w') watch = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: evalops eval run --spec=<name> [--spec-id=<uuid>] [--watch]');
      return;
    } else if (!arg.startsWith('-')) {
      specName = arg;
    }
  }

  if (!specName && !specId) {
    console.error('Error: provide --spec=<name> or --spec-id=<uuid>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const api = new ApiClient(config);

  if (!specId) {
    const specs = await api.get<{ id: string; name: string }[]>('/api/core/eval-specs');
    const found = specs.find(s => s.name === specName);
    if (!found) {
      console.error(`Eval spec "${specName}" not found. Available:\n${specs.map(s => `  ${s.name}`).join('\n')}`);
      process.exit(1);
    }
    specId = found.id;
  }

  console.log(`Starting eval run for spec: ${specName || specId}`);
  const runName = `${specName || 'run'} — ${new Date().toISOString()}`;
  const run = await api.post<RunResult>('/api/evaluation/runs', { evalSpecId: specId, name: runName });
  console.log(`Run created: ${run.id}`);

  if (!watch) {
    console.log(`Run triggered. Check status: evalops eval run --spec-id=${specId}`);
    console.log(`Or view in the UI: ${config.apiUrl.replace(':3000', ':4200')}/runs/${run.id}`);
    return;
  }

  process.stdout.write('Waiting for completion');
  const completed = await pollRun(api, run.id);
  console.log('');

  const icon = completed.decision === 'fail' ? '❌' : completed.decision === 'warn' ? '⚠️' : '✅';
  const passRate = completed.results?.passRate != null
    ? ` — pass rate: ${(completed.results.passRate * 100).toFixed(1)}%`
    : '';
  const cost = completed.costUsd != null ? ` — cost: $${completed.costUsd.toFixed(4)}` : '';

  console.log(`${icon} ${completed.decision?.toUpperCase() ?? 'COMPLETED'}${passRate}${cost}`);

  if (completed.decision === 'fail') process.exit(1);
}
