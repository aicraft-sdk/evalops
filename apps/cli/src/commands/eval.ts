import * as fs from 'fs';
import * as path from 'path';
import { EvalOpsClient } from '@evalops/sdk';
import type { RunResponse, EvalSpecResponse } from '@evalops/sdk';
import { formatJUnitXML, formatJsonSummary, SuiteRunResult, ScenarioRun } from '@evalops/sdk-formatters';
import { loadConfig, requireAuth } from '../lib/config';

function buildSuiteResult(run: Record<string, unknown>, specName: string, startedAt: Date): SuiteRunResult {
  const decision = (run['decision'] as string | null) ?? 'pass';
  const completedAt = new Date();
  const scenarioRun: ScenarioRun = {
    runId: run['id'] as string,
    scenarioId: run['id'] as string,
    scenarioName: specName,
    run: {
      decision,
      duration: (run['duration'] as number | null) ?? null,
      status: run['status'] as string,
      cost: (run['costUsd'] as number | null) ?? null,
    },
  };
  return {
    suiteId: run['id'] as string,
    suiteName: specName,
    startedAt,
    completedAt,
    scenarios: [scenarioRun],
  };
}

export async function runEval(args: string[]): Promise<void> {
  let specPath = '';
  let watch = false;
  let failOnWarn = false;
  let outFormat: 'junit' | 'json' | 'both' | undefined;
  let outDir = './test-results';

  for (const arg of args) {
    if (arg === '--watch' || arg === '-w') watch = true;
    else if (arg === '--fail-on-warn') failOnWarn = true;
    else if (arg.startsWith('--out=')) outFormat = arg.slice('--out='.length) as 'junit' | 'json' | 'both';
    else if (arg.startsWith('--out-dir=')) outDir = arg.slice('--out-dir='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: evalops eval <spec.yaml> [options]',
        '',
        'Options:',
        '  --watch           Poll and show progress',
        '  --fail-on-warn    Exit 1 on warn decision (not just fail)',
        '  --out <format>    Output format: junit, json, both',
        '  --out-dir <dir>   Output directory (default: ./test-results)',
      ].join('\n'));
      return;
    } else if (!arg.startsWith('-')) {
      specPath = arg;
    }
  }

  if (!specPath) {
    console.error('Error: provide a spec file. Usage: evalops eval <spec.yaml>');
    process.exit(1);
  }

  const config = loadConfig();
  requireAuth(config);
  const client = new EvalOpsClient({ baseUrl: config.apiUrl, token: config.token });

  // Upsert the spec (CRITICAL-5 file check is in spec-commands; here we also guard)
  const resolvedPath = path.resolve(specPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Spec file not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Upserting spec from "${resolvedPath}"...`);

  // HIGH-4: wrap upsertFromYaml in try/catch with contextual message
  let spec: EvalSpecResponse;
  try {
    spec = await client.specs.upsertFromYaml(resolvedPath);
  } catch (err) {
    console.error(`Failed to upsert spec: ${(err as Error).message}`);
    console.error('Is the EvalOps server running? Try: evalops doctor');
    process.exit(1);
  }
  console.log(`Spec: ${spec.name} (${spec.id})`);

  // Create a run
  const startedAt = new Date();

  // HIGH-4: wrap runs.create in try/catch with contextual message
  let run: RunResponse;
  try {
    run = await client.runs.create({ evalSpecId: spec.id });
  } catch (err) {
    console.error(`Failed to create run: ${(err as Error).message}`);
    process.exit(1);
  }

  // HIGH-1: print run ID immediately so user always has it
  console.log(`Run created: ${run.id}`);

  // HIGH-1: gate waitFor behind --watch flag (fire-and-forget when not watching)
  if (!watch) {
    console.log(`Use --watch to poll for results, or: evalops run get ${run.id}`);
    return; // exit 0 (fire-and-forget)
  }

  console.log('Polling for results...');
  process.stdout.write('Waiting');

  // CRITICAL-3: wrap waitFor in try/catch — run ID already printed above
  let done: RunResponse;
  try {
    done = await client.runs.waitFor(run.id, { timeoutMs: 120_000 });
  } catch (err) {
    console.error(`\nRun timed out or failed: ${run.id}`);
    console.error(`Check the dashboard or run: evalops run get ${run.id}`);
    console.error((err as Error).message);
    process.exit(1);
  }

  console.log('');

  const decision = done.decision ?? 'unknown';
  const icon = decision === 'pass' ? '[PASS]' : decision === 'warn' ? '[WARN]' : decision === 'fail' ? '[FAIL]' : '[...]';
  console.log(`${icon} Decision: ${decision.toUpperCase()}`);
  console.log(`   Run ID:  ${done.id}`);
  console.log(`   Status:  ${done.status}`);

  // Write output files if requested
  if (outFormat) {
    fs.mkdirSync(outDir, { recursive: true });
    const suiteResult = buildSuiteResult(done as unknown as Record<string, unknown>, spec.name, startedAt);

    if (outFormat === 'junit' || outFormat === 'both') {
      const xml = formatJUnitXML(suiteResult);
      const outPath = path.join(outDir, 'junit.xml');
      fs.writeFileSync(outPath, xml, 'utf-8');
      console.log(`   JUnit:  ${outPath}`);
    }

    if (outFormat === 'json' || outFormat === 'both') {
      const json = formatJsonSummary(suiteResult);
      const outPath = path.join(outDir, 'summary.json');
      fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`   JSON:   ${outPath}`);
    }
  }

  // Exit code: 0=pass, 1=fail or warn (if --fail-on-warn)
  if (decision === 'fail') process.exit(1);
  if (failOnWarn && decision === 'warn') process.exit(1);
}
