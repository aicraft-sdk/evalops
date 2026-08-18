#!/usr/bin/env node
// Evaluation runner for the evaluate-pr composite action.
// Uses native fetch (Node 18+). No npm install required.

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.EVALOPS_API_KEY;
const SERVICE_TOKEN = process.env.EVALOPS_SERVICE_TOKEN;
const API_URL = (process.env.EVALOPS_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUITE_ID = process.env.INPUT_SUITE_ID || '';
const SUITE_NAME = process.env.INPUT_SUITE_NAME || '';
const ORG_ID = process.env.INPUT_ORG_ID || '';
const FAIL_ON_WARN = process.env.INPUT_FAIL_ON_WARN === 'true';
const OUTPUT_DIR = process.env.INPUT_OUTPUT_DIR || 'test-results';
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT || '';
const COMMIT_SHA = process.env.GITHUB_SHA || '';

function setOutput(name, value) {
  if (GITHUB_OUTPUT) {
    fs.appendFileSync(GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function authHeaders() {
  if (API_KEY) return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  if (SERVICE_TOKEN) return { 'X-Service-Token': SERVICE_TOKEN, 'Content-Type': 'application/json' };
  throw new Error('Set EVALOPS_API_KEY or EVALOPS_SERVICE_TOKEN');
}

// Suite execution is synchronous server-side (every scenario's real LLM call/turn is awaited
// before the run responds) - AIProviderService.withResilience alone defaults to a 30s timeout
// with up to 3 retries, so a multi-scenario/multi-turn suite can legitimately take minutes.
// Match pollRun()'s existing 600_000ms suite-execution budget assumption rather than the short
// hang-guard used for simple metadata GETs.
const RUN_TIMEOUT_MS = 600_000;

async function request(method, urlPath, body, timeoutMs = 10_000) {
  const url = `${API_URL}${urlPath}`;
  const resp = await fetch(url, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${method} ${url} → HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function getSuiteIdByName(name) {
  const suites = await request('GET', `/api/evaluation/simulations/suites`);
  const found = suites.find(s => s.name === name);
  if (!found) throw new Error(`Suite "${name}" not found`);
  return found.id;
}

async function pollRun(runId, timeoutMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const run = await request('GET', `/api/evaluation/runs/${runId}`);
      if (run.status === 'completed' || run.status === 'failed') return run;
    } catch (err) {
      // Non-fatal: a single slow/failed poll (timeout, transient network blip, etc.) should
      // not abort the whole run - retry on the next iteration within the outer timeoutMs
      // budget, matching maybeDecorate()'s existing non-fatal logging style.
      console.log(`Poll for run ${runId} failed non-fatally: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Run ${runId} timed out after ${timeoutMs / 1000}s`);
}

function buildJUnit(suiteName, scenarios) {
  const failures = scenarios.filter(s => s.run.decision === 'fail').length;
  const total = scenarios.length;
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites>`,
    `  <testsuite name="${suiteName}" tests="${total}" failures="${failures}" errors="0" skipped="0">`,
  ];
  for (const s of scenarios) {
    const decision = s.run.decision || 'pass';
    lines.push(`    <testcase name="${s.name}" classname="${suiteName}" time="${(s.run.duration || 0) / 1000}">`);
    if (decision === 'fail') {
      lines.push(`      <failure message="Policy violation">${s.run.name || s.name} failed policy check</failure>`);
    } else if (decision === 'warn') {
      lines.push(`      <system-out>Warning: policy threshold approached</system-out>`);
    }
    lines.push(`    </testcase>`);
  }
  lines.push(`  </testsuite>`, `</testsuites>`);
  return lines.join('\n');
}

async function main() {
  if (!API_KEY && !SERVICE_TOKEN) {
    console.error('Error: set EVALOPS_API_KEY or EVALOPS_SERVICE_TOKEN');
    process.exit(1);
  }

  let suiteId = SUITE_ID;
  if (!suiteId) {
    if (!SUITE_NAME) { console.error('Error: provide suite-id or suite-name'); process.exit(1); }
    suiteId = await getSuiteIdByName(SUITE_NAME);
  }

  const suite = await request('GET', `/api/evaluation/simulations/suites/${suiteId}`);
  const scenarios = await request('GET', `/api/evaluation/simulations/suites/${suiteId}/scenarios`);
  scenarios.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  console.log(`Running suite: ${suite.name} (${scenarios.length} scenarios)`);

  const { runs: initialRuns } = await request('POST', `/api/evaluation/simulations/suites/${suiteId}/run`, {
    commitSha: COMMIT_SHA || undefined,
  }, RUN_TIMEOUT_MS);

  const completedRuns = [];
  for (const r of initialRuns) {
    const completed = await pollRun(r.id);
    completedRuns.push(completed);
    console.log(`  ${completed.decision === 'fail' ? '❌' : completed.decision === 'warn' ? '⚠️' : '✅'} ${completed.name || r.id}`);
  }

  const scenarioResults = completedRuns.map((run, i) => ({
    name: scenarios[i]?.name || run.name || run.id,
    run,
  }));

  const passed = completedRuns.filter(r => r.decision === 'pass' || !r.decision).length;
  const warned = completedRuns.filter(r => r.decision === 'warn').length;
  const failed = completedRuns.filter(r => r.decision === 'fail').length;
  const passRate = completedRuns.length > 0 ? passed / completedRuns.length : 0;
  const decision = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const junitPath = path.join(OUTPUT_DIR, 'evalops-results.xml');
  fs.writeFileSync(junitPath, buildJUnit(suite.name, scenarioResults));
  console.log(`JUnit XML → ${junitPath}`);

  const summaryPath = path.join(OUTPUT_DIR, 'evalops-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    suiteId, suiteName: suite.name, commitSha: COMMIT_SHA,
    decision, passRate, total: completedRuns.length,
    passed, warned, failed, runs: scenarioResults.map(s => ({
      name: s.name, decision: s.run.decision, duration: s.run.duration,
    })),
  }, null, 2));
  console.log(`JSON summary → ${summaryPath}`);

  setOutput('decision', decision);
  setOutput('pass_rate', passRate.toFixed(4));
  setOutput('suite_name', suite.name);
  setOutput('total_scenarios', String(completedRuns.length));
  setOutput('passed', String(passed));
  setOutput('warned', String(warned));
  setOutput('failed', String(failed));
  setOutput('report_path', junitPath);

  const icon = decision === 'pass' ? '✅' : decision === 'warn' ? '⚠️' : '❌';
  console.log(`\n${icon} Suite ${decision.toUpperCase()} — pass rate: ${(passRate * 100).toFixed(1)}% (${passed}/${completedRuns.length})`);

  await maybeDecorate(completedRuns);

  if (decision === 'fail' || (decision === 'warn' && FAIL_ON_WARN)) {
    process.exit(1);
  }
}

// Best-effort, opt-in call to the Enterprise PR-decoration endpoint. Never throws out of
// main() and never affects process.exit() — a 403 (no license) or any other failure is
// logged and swallowed so the free CI gate above is completely unaffected.
async function maybeDecorate(completedRuns) {
  if (process.env.INPUT_ENABLE_PR_DECORATION !== 'true') return;
  for (const run of completedRuns) {
    try {
      const res = await fetch(`${API_URL}/api/evaluation/pr-decoration`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ runId: run.id }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 403) {
        console.log('PR decoration is an Enterprise feature and no license is configured — skipping (non-fatal).');
        return;
      }
      if (!res.ok) {
        console.log(`PR decoration call failed non-fatally: HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(`PR decoration call failed non-fatally: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
