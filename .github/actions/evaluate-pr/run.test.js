// Tests for the evaluate-pr composite action's run.js, focused on pollRun()'s error-handling
// contract:
//   (a) a transient/network-level poll failure is tolerated and retried within the outer budget
//   (b) a real HTTP 4xx/5xx from the server fails FAST (immediately), not after exhausting the
//       outer timeout budget
//
// Run with: node --test .github/actions/evaluate-pr/run.test.js
// (Node's built-in test runner - no new dependency. Uses a real http.Server, not mocked fetch.)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server;
let baseUrl;
let transientAttempts = 0;
let brokenAttempts = 0;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/api/evaluation/runs/run-transient') {
      transientAttempts += 1;
      if (transientAttempts === 1) {
        // Simulate a transient network-level failure (connection reset before any response) -
        // this should be tolerated and retried by pollRun(), not treated as a permanent failure.
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'run-transient', status: 'completed', decision: 'pass' }));
      return;
    }
    if (req.url === '/api/evaluation/runs/run-broken') {
      // Simulate a genuinely broken run (bad run ID / expired auth) - a real, fast HTTP error
      // response on EVERY poll. pollRun() must fail fast on this, not retry for the full budget.
      brokenAttempts += 1;
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'run not found' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  process.env.EVALOPS_API_URL = baseUrl;
  process.env.EVALOPS_API_KEY = 'test-key';
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('pollRun() tolerates one transient network failure then succeeds', async () => {
  const { pollRun } = await import('./run.js');

  const start = Date.now();
  const result = await pollRun('run-transient', 8000);
  const elapsed = Date.now() - start;

  assert.equal(result.status, 'completed');
  assert.equal(result.decision, 'pass');
  assert.equal(transientAttempts, 2, 'expected exactly one retry after the transient failure');
  // The 3000ms inter-poll delay must have been honored (proves it retried, not short-circuited).
  assert.ok(elapsed >= 3000, `expected the retry delay to have elapsed, got ${elapsed}ms`);
});

test('pollRun() fails fast on a real HTTP 404 instead of exhausting the timeout budget', async () => {
  const { pollRun, HttpStatusError } = await import('./run.js');

  const start = Date.now();
  await assert.rejects(
    () => pollRun('run-broken', 600_000), // full production-sized outer budget (10 min)
    (err) => {
      assert.ok(err instanceof HttpStatusError, `expected HttpStatusError, got ${err.constructor.name}: ${err.message}`);
      assert.equal(err.status, 404);
      assert.match(err.message, /HTTP 404/);
      return true;
    }
  );
  const elapsed = Date.now() - start;

  assert.equal(brokenAttempts, 1, 'expected exactly one poll attempt - no retrying on a real HTTP error');
  assert.ok(elapsed < 3000, `expected fail-fast (well under one 3000ms poll interval), took ${elapsed}ms`);
});
