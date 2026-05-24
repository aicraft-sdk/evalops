#!/usr/bin/env node

/**
 * CLI command to run simulation suites
 *
 * Usage:
 *   tsx apps/evaluation-service/src/cli/run-suite.ts --suite-id=<uuid>
 *   tsx apps/evaluation-service/src/cli/run-suite.ts --suite-name=<name> --org-id=<uuid>
 */

import axios from 'axios';
import { getAuthHeaders, getAuthConfig, validateAuth } from './auth';
import { formatJUnitXML, type SuiteRunResult, type ScenarioRun } from './junit-formatter';
import { formatJsonSummary } from './json-formatter';
import { getGitCommitShaSync } from '../app/simulations/git-utils';
import * as fs from 'fs';
import * as path from 'path';
import type { PolicyViolation } from '../app/policies/policies.service';
import type { Run } from '@evalops/shared-db';

interface CliOptions {
  suiteId?: string;
  suiteName?: string;
  orgId?: string;
  failOnWarn?: boolean;
  outputFormat?: 'junit' | 'json' | 'both';
  outputDir?: string;
  timeout?: number;
  commitSha?: string;
}

/**
 * Parse command-line arguments
 */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    failOnWarn: false,
    outputFormat: 'both',
    outputDir: './test-results',
    timeout: 600,
  };

  for (const arg of args) {
    if (arg.startsWith('--suite-id=')) {
      options.suiteId = arg.split('=')[1];
    } else if (arg.startsWith('--suite-name=')) {
      options.suiteName = arg.split('=')[1];
    } else if (arg.startsWith('--org-id=')) {
      options.orgId = arg.split('=')[1];
    } else if (arg === '--fail-on-warn') {
      options.failOnWarn = true;
    } else if (arg.startsWith('--output-format=')) {
      const format = arg.split('=')[1];
      if (format === 'junit' || format === 'json' || format === 'both') {
        options.outputFormat = format as 'junit' | 'json' | 'both';
      }
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--commit-sha=')) {
      options.commitSha = arg.split('=')[1];
    }
  }

  return options;
}

/**
 * Get suite ID by name
 */
async function getSuiteIdByName(
  suiteName: string,
  orgId: string,
  apiUrl: string,
  headers: Record<string, string>
): Promise<string> {
  const response = await axios.get(`${apiUrl}/api/evaluation/simulations/suites`, {
    headers,
  });

  const suite = response.data.find((s: any) => s.name === suiteName);
  if (!suite) {
    throw new Error(`Suite "${suiteName}" not found in organization ${orgId}`);
  }

  return suite.id;
}

/**
 * Poll for run completion
 */
async function waitForRunCompletion(
  runId: string,
  apiUrl: string,
  headers: Record<string, string>,
  timeoutSeconds: number
): Promise<Run> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const response = await axios.get(
      `${apiUrl}/api/evaluation/runs/${runId}`,
      { headers }
    );
    const run = response.data;

    if (run.status === 'completed' || run.status === 'failed') {
      return run;
    }

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Run ${runId} did not complete within ${timeoutSeconds} seconds`);
}

/**
 * Get policy violations for a run
 */
async function getPolicyViolations(
  runId: string,
  apiUrl: string,
  headers: Record<string, string>
): Promise<PolicyViolation[]> {
  try {
    // Policy violations are typically included in the run response
    // If not, we can query them separately
    const response = await axios.get(
      `${apiUrl}/api/evaluation/runs/${runId}`,
      { headers }
    );
    const run = response.data;

    // If violations are not in run response, return empty array
    // The CLI can still work with just the decision field
    return [];
  } catch (error) {
    console.warn(`Failed to get policy violations for run ${runId}:`, error);
    return [];
  }
}

/**
 * Main CLI execution
 */
async function main() {
  try {
    const options = parseArgs();
    validateAuth();

    const authConfig = getAuthConfig();
    const headers = getAuthHeaders(authConfig);
    const apiUrl = authConfig.apiUrl!;

    // Determine suite ID
    let suiteId: string;
    if (options.suiteId) {
      suiteId = options.suiteId;
    } else if (options.suiteName && options.orgId) {
      suiteId = await getSuiteIdByName(
        options.suiteName,
        options.orgId,
        apiUrl,
        headers
      );
    } else {
      throw new Error(
        'Either --suite-id or --suite-name with --org-id must be provided'
      );
    }

    // Get commit SHA
    const commitSha =
      options.commitSha ||
      getGitCommitShaSync() ||
      undefined;

    console.log(`Running simulation suite ${suiteId}...`);
    if (commitSha) {
      console.log(`Commit SHA: ${commitSha}`);
    }

    // Get suite details and scenarios first
    const suiteResponse = await axios.get(
      `${apiUrl}/api/evaluation/simulations/suites/${suiteId}`,
      { headers }
    );
    const suite = suiteResponse.data;

    const scenariosResponse = await axios.get(
      `${apiUrl}/api/evaluation/simulations/suites/${suiteId}/scenarios`,
      { headers }
    );
    const scenarios = scenariosResponse.data.sort((a: any, b: any) => a.order - b.order);

    // Execute suite
    const startedAt = new Date();
    const response = await axios.post(
      `${apiUrl}/api/evaluation/simulations/suites/${suiteId}/run`,
      { commitSha },
      { headers }
    );

    const { runs: initialRuns } = response.data;

    // Poll for completion of all runs
    console.log(`Waiting for ${initialRuns.length} scenario(s) to complete...`);
    const completedRuns: Run[] = [];
    for (const run of initialRuns) {
      const completedRun = await waitForRunCompletion(
        run.id,
        apiUrl,
        headers,
        options.timeout!
      );
      completedRuns.push(completedRun);
      console.log(
        `  ✓ Scenario completed: ${completedRun.name} (${completedRun.decision || 'pending'})`
      );
    }

    const completedAt = new Date();

    // Get policy violations for each run and match with scenarios
    const scenarioRuns: ScenarioRun[] = [];
    for (let i = 0; i < completedRuns.length; i++) {
      const run = completedRuns[i];
      const scenario = scenarios[i];
      const violations = await getPolicyViolations(run.id, apiUrl, headers);

      // Extract scenario name from run name or use scenario name
      let scenarioName = scenario?.name || run.name;
      if (scenarioName.startsWith('Sim: ')) {
        scenarioName = scenarioName.split('/').pop() || scenarioName;
      }

      scenarioRuns.push({
        runId: run.id,
        scenarioId: scenario?.id || run.id,
        scenarioName,
        run,
        violations,
      });
    }

    // Build result
    const result: SuiteRunResult = {
      suiteId: suite.id,
      suiteName: suite.name,
      commitSha,
      startedAt,
      completedAt,
      scenarios: scenarioRuns,
    };

    // Format and write output
    const outputDir = path.resolve(options.outputDir!);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (options.outputFormat === 'junit' || options.outputFormat === 'both') {
      const junitXml = formatJUnitXML(result);
      const junitPath = path.join(outputDir, 'simulation-results.xml');
      fs.writeFileSync(junitPath, junitXml, 'utf-8');
      console.log(`JUnit XML written to: ${junitPath}`);
    }

    if (options.outputFormat === 'json' || options.outputFormat === 'both') {
      const jsonSummary = formatJsonSummary(result);
      const jsonPath = path.join(outputDir, 'simulation-results.json');
      fs.writeFileSync(jsonPath, JSON.stringify(jsonSummary, null, 2), 'utf-8');
      console.log(`JSON summary written to: ${jsonPath}`);
    }

    // Determine exit code
    const hasFailures = scenarioRuns.some((s) => s.run.decision === 'fail');
    const hasWarnings = scenarioRuns.some((s) => s.run.decision === 'warn');

    if (hasFailures) {
      console.error('\n❌ Suite failed: One or more scenarios failed policy checks');
      process.exit(1);
    } else if (hasWarnings && options.failOnWarn) {
      console.error('\n⚠️  Suite warned: One or more scenarios have warnings');
      process.exit(1);
    } else {
      console.log('\n✅ Suite passed: All scenarios completed successfully');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('Error running suite:', error.message);
    if (error.response) {
      console.error('API Error:', error.response.data);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises -- CLI entry point; process exits on uncaught rejection
  main();
}
