import { EvalOpsClient } from '@evalops/sdk';
import { loadConfig, requireAuth } from '../lib/config';

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
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  if (!specId) {
    const specs = await client.specs.list();
    const found = specs.find(s => s.name === specName);
    if (!found) {
      console.error(`Eval spec "${specName}" not found. Available:\n${specs.map(s => `  ${s.name}`).join('\n')}`);
      process.exit(1);
    }
    specId = found.id;
  }

  console.log(`Starting eval run for spec: ${specName || specId}`);
  const runName = `${specName || 'run'} — ${new Date().toISOString()}`;
  const run = await client.runs.create({ evalSpecId: specId, name: runName });
  console.log(`Run created: ${run.id}`);

  if (!watch) {
    console.log(`Run triggered. Check status: evalops run get ${run.id}`);
    return;
  }

  process.stdout.write('Waiting for completion');
  const completed = await client.runs.waitFor(run.id, { timeoutMs: 600_000 });
  console.log('');

  const decision = completed.decision ?? 'completed';
  const icon = decision === 'fail' ? 'FAIL' : decision === 'warn' ? 'WARN' : 'PASS';
  console.log(`[${icon}] ${decision.toUpperCase()}`);

  if (completed.decision === 'fail') process.exit(1);
}
