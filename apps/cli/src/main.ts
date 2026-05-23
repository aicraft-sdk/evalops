#!/usr/bin/env node

import { runLogin } from './commands/login';
import { runEvalRun } from './commands/eval-run';
import { runDatasetPush } from './commands/dataset-push';
import { runAgentPublish } from './commands/agent-publish';
import { runPolicyCheck } from './commands/policy-check';
import { runDoctor } from './commands/doctor';

const VERSION = '0.1.0';

const HELP = `
Usage: evalops <command> [subcommand] [options]

Commands:
  login                   Authenticate and save credentials
  eval run <spec>         Trigger an evaluation run
  dataset push <file>     Upload a dataset from a JSON file
  agent publish <file>    Publish an AgentMD agent definition
  policy check <run-id>   Print the policy verdict for a run
  doctor                  Check environment and connectivity

Global options:
  --help, -h              Show help
  --version, -v           Print version

Environment:
  EVALOPS_API_URL         Override the API base URL (default: http://localhost:3000)
  EVALOPS_API_KEY         JWT token (skips credentials file lookup)
  EVALOPS_SERVICE_TOKEN   Service-to-service token

Run \`evalops <command> --help\` for command-specific options.
`;

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(`evalops v${VERSION}`);
    return;
  }

  if (command === 'login') {
    await runLogin(rest);
    return;
  }

  if (command === 'eval') {
    const [subcommand, ...subArgs] = rest;
    if (subcommand === 'run') {
      await runEvalRun(subArgs);
    } else {
      console.log('Usage: evalops eval run <spec-name> [--watch]');
      process.exit(1);
    }
    return;
  }

  if (command === 'dataset') {
    const [subcommand, ...subArgs] = rest;
    if (subcommand === 'push') {
      await runDatasetPush(subArgs);
    } else {
      console.log('Usage: evalops dataset push <file.json>');
      process.exit(1);
    }
    return;
  }

  if (command === 'agent') {
    const [subcommand, ...subArgs] = rest;
    if (subcommand === 'publish') {
      await runAgentPublish(subArgs);
    } else {
      console.log('Usage: evalops agent publish <agent.md>');
      process.exit(1);
    }
    return;
  }

  if (command === 'policy') {
    const [subcommand, ...subArgs] = rest;
    if (subcommand === 'check') {
      await runPolicyCheck(subArgs);
    } else {
      console.log('Usage: evalops policy check <run-id>');
      process.exit(1);
    }
    return;
  }

  if (command === 'doctor') {
    await runDoctor(rest);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log(HELP);
  process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err.message ?? err);
  process.exit(1);
});
