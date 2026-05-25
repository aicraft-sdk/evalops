#!/usr/bin/env node

import { Command } from 'commander';
import { runLogin } from './commands/login';
import { runEvalRun } from './commands/eval-run';
import { runEval } from './commands/eval';
import { runDatasetPush } from './commands/dataset-push';
import { runAgentPublish } from './commands/agent-publish';
import { runPolicyCheck } from './commands/policy-check';
import { runDoctor } from './commands/doctor';
import { runInit } from './commands/init';
import { runWhoami } from './commands/whoami';
import { runTokenCreate, runTokenList, runTokenRevoke } from './commands/token';
import { runSpecPush, runSpecList } from './commands/spec-commands';
import { runRunGet } from './commands/run-get';
import { registerDev } from './commands/dev';

const program = new Command();

program
  .name('evalops')
  .description('EvalOps CLI — evaluate LLM pipelines from the terminal')
  .version('0.2.0');

// ── login ──────────────────────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate and save credentials')
  .option('--url <url>', 'API base URL', 'http://localhost:3000')
  .option('--email <email>', 'Email address (or set EVALOPS_USERNAME)')
  .action(async (opts: { url?: string; email?: string }) => {
    const args: string[] = [];
    if (opts.url) args.push(`--url=${opts.url}`);
    if (opts.email) args.push(`--email=${opts.email}`);
    // Password is read from EVALOPS_PASSWORD env var or prompted interactively in login.ts
    await runLogin(args);
  });

// ── logout ─────────────────────────────────────────────────────────────────
program
  .command('logout')
  .description('Remove saved credentials')
  .action(() => {
    const { clearCredentials } = require('./lib/credentials') as { clearCredentials: () => void };
    clearCredentials();
    console.log('Logged out. Credentials removed.');
  });

// ── whoami ─────────────────────────────────────────────────────────────────
program
  .command('whoami')
  .description('Show current authentication info (local only)')
  .action(() => {
    runWhoami();
  });

// ── init ───────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize an EvalOps project in the current directory')
  .option('--demo', 'Also create eval/hello.eval.yaml demo spec')
  .option('--name <slug>', 'Project name slug')
  .action((opts: { demo?: boolean; name?: string }) => {
    const args: string[] = [];
    if (opts.demo) args.push('--demo');
    if (opts.name) args.push(`--name=${opts.name}`);
    runInit(args);
  });

// ── eval ───────────────────────────────────────────────────────────────────
const evalCmd = program.command('eval').description('Evaluation commands');

evalCmd
  .command('run [spec]')
  .description('Trigger an evaluation run by spec name or ID (legacy)')
  .option('--spec <name>', 'Spec name')
  .option('--spec-id <id>', 'Spec UUID')
  .option('--watch', 'Poll until completion')
  .action(async (spec: string | undefined, opts: { spec?: string; specId?: string; watch?: boolean }) => {
    const args: string[] = [];
    if (spec) args.push(spec);
    if (opts.spec) args.push(`--spec=${opts.spec}`);
    if (opts.specId) args.push(`--spec-id=${opts.specId}`);
    if (opts.watch) args.push('--watch');
    await runEvalRun(args);
  });

// evalops eval <spec.yaml> — KILLER COMMAND (direct subcommand on eval group)
// Commander allows positional arguments on the group command itself
evalCmd
  .arguments('[specYaml]')
  .option('--watch', 'Poll and show progress')
  .option('--fail-on-warn', 'Exit 1 on warn decision')
  .option('--out <format>', 'Output format: junit, json, both')
  .option('--out-dir <dir>', 'Output directory', './test-results')
  .action(async (specYaml: string | undefined, opts: { watch?: boolean; failOnWarn?: boolean; out?: string; outDir?: string }) => {
    if (!specYaml) return; // handled by subcommand
    const args: string[] = [specYaml];
    if (opts.watch) args.push('--watch');
    if (opts.failOnWarn) args.push('--fail-on-warn');
    if (opts.out) args.push(`--out=${opts.out}`);
    if (opts.outDir) args.push(`--out-dir=${opts.outDir}`);
    await runEval(args);
  });

// ── spec ───────────────────────────────────────────────────────────────────
const specCmd = program.command('spec').description('Eval spec commands');

specCmd
  .command('push <specYaml>')
  .description('Upsert an eval spec from a YAML file')
  .action(async (specYaml: string) => {
    await runSpecPush([specYaml]);
  });

specCmd
  .command('list')
  .description('List all eval specs')
  .action(async () => {
    await runSpecList();
  });

// ── dataset ────────────────────────────────────────────────────────────────
const datasetCmd = program.command('dataset').description('Dataset commands');

datasetCmd
  .command('push <file>')
  .description('Upload a dataset from a JSON or YAML file')
  .option('--name <name>', 'Override dataset name')
  .action(async (file: string, opts: { name?: string }) => {
    const args = [file];
    if (opts.name) args.push(`--name=${opts.name}`);
    await runDatasetPush(args);
  });

// ── agent ──────────────────────────────────────────────────────────────────
const agentCmd = program.command('agent').description('Agent commands');

agentCmd
  .command('publish <file>')
  .description('Publish an AgentMD agent definition')
  .action(async (file: string) => {
    await runAgentPublish([file]);
  });

// ── policy ─────────────────────────────────────────────────────────────────
const policyCmd = program.command('policy').description('Policy commands');

policyCmd
  .command('check <runId>')
  .description('Print the policy verdict for a run')
  .action(async (runId: string) => {
    await runPolicyCheck([runId]);
  });

// ── token ──────────────────────────────────────────────────────────────────
const tokenCmd = program.command('token').description('Personal access token commands');

tokenCmd
  .command('create')
  .description('Create a new personal access token')
  .requiredOption('--name <label>', 'Token label')
  .option('--ttl <days>', 'TTL in days', '90')
  .option('--scopes <csv>', 'Comma-separated scopes')
  .action(async (opts: { name: string; ttl?: string; scopes?: string }) => {
    const args = [`--name=${opts.name}`];
    if (opts.ttl) args.push(`--ttl=${opts.ttl}`);
    if (opts.scopes) args.push(`--scopes=${opts.scopes}`);
    await runTokenCreate(args);
  });

tokenCmd
  .command('list')
  .description('List all personal access tokens')
  .action(async () => {
    await runTokenList();
  });

tokenCmd
  .command('revoke <id>')
  .description('Revoke a personal access token by ID')
  .action(async (id: string) => {
    await runTokenRevoke([id]);
  });

// ── run ────────────────────────────────────────────────────────────────────
const runCmd = program.command('run').description('Run commands');

runCmd
  .command('get <id>')
  .description('Get details for a specific run')
  .option('--json', 'Output raw JSON')
  .action(async (id: string, opts: { json?: boolean }) => {
    const args = [id];
    if (opts.json) args.push('--json');
    await runRunGet(args);
  });

// ── dev ────────────────────────────────────────────────────────────────────
registerDev(program);

// ── doctor ─────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Check environment and connectivity')
  .action(async () => {
    await runDoctor([]);
  });

// ── parse ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-floating-promises
program.parseAsync(process.argv).catch(err => {
  console.error((err as Error).message ?? err);
  process.exit(1);
});
