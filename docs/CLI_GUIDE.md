# EvalOps CLI Guide

The `evalops` CLI is the fastest way to interact with EvalOps from a terminal or CI pipeline. It wraps the REST API so you don't need to hand-craft curl commands.

---

## Installation / Setup

No separate install needed. Run directly from the monorepo:

```bash
npm run evalops -- <command>
```

Or invoke tsx directly:

```bash
./node_modules/.bin/tsx apps/cli/src/main.ts <command>
```

### Authentication

The CLI looks for credentials in this order:

1. `EVALOPS_API_KEY` environment variable (JWT token)
2. `EVALOPS_SERVICE_TOKEN` environment variable (service-to-service token)
3. `~/.evalops/credentials.json` (saved by `evalops login`)

Set the API URL via `EVALOPS_API_URL` (default: `http://localhost:3000`).

---

## Commands

### `login`

Authenticate against an EvalOps instance and save the JWT to `~/.evalops/credentials.json`.

```bash
npm run evalops -- login
```

You will be prompted for email and password.

**Options:**

| Flag | Description |
|------|-------------|
| `--url=<url>` | API base URL (default: `http://localhost:3000`) |
| `--email=<email>` | Email address (skip interactive prompt) |
| `--password=<password>` | Password (skip interactive prompt) |

**Examples:**

```bash
# Interactive login against local instance
npm run evalops -- login

# Login against a remote instance
npm run evalops -- login --url=https://evalops.internal

# Non-interactive (CI / scripting)
npm run evalops -- login \
  --url=https://evalops.internal \
  --email=ci-bot@example.com \
  --password=$CI_PASSWORD
```

**Output:**
```
Logged in. Token saved to ~/.evalops/credentials.json
API URL: http://localhost:3000
```

---

### `eval run`

Trigger an evaluation run for a named eval spec. Optionally watch until completion.

```bash
npm run evalops -- eval run <spec-name> [--watch]
```

**Options:**

| Flag | Description |
|------|-------------|
| `<spec-name>` | Name of the eval spec (positional argument) |
| `--spec=<name>` | Name of the eval spec (named alternative) |
| `--spec-id=<uuid>` | UUID of the eval spec (skips name lookup) |
| `--watch`, `-w` | Poll until the run completes and print the verdict |

**Examples:**

```bash
# Trigger a run and print the run ID (fire and forget)
npm run evalops -- eval run "Production Quality Gates"

# Trigger and wait for the result
npm run evalops -- eval run "Production Quality Gates" --watch

# By spec ID (faster — skips name lookup)
npm run evalops -- eval run --spec-id=abc123-def456 --watch
```

**Output (with `--watch`):**
```
Starting eval run for spec: Production Quality Gates
Run created: run-789xyz
Waiting for completion...........
✅ PASS — pass rate: 94.3% — cost: $0.0124
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Run passed |
| `1` | Run failed policy checks |

---

### `dataset push`

Upload a dataset from a local JSON file to EvalOps.

```bash
npm run evalops -- dataset push <file.json>
```

**Options:**

| Flag | Description |
|------|-------------|
| `<file.json>` | Path to the dataset JSON file (positional) |
| `--name=<name>` | Override the dataset name (default: filename without extension) |

**File format:**

```json
{
  "name": "Fraud Detection — Golden Set",
  "description": "100 labelled transactions for regression testing",
  "samples": [
    {
      "input": { "transactionId": "txn-001", "amount": 9999 },
      "expectedOutput": { "decision": "fraud", "confidence": 0.97 },
      "metadata": { "label": "confirmed_fraud", "source": "production-2024-Q4" }
    },
    {
      "input": { "transactionId": "txn-002", "amount": 12 },
      "expectedOutput": { "decision": "legitimate" },
      "metadata": { "label": "legitimate" }
    }
  ]
}
```

**Examples:**

```bash
# Push with name from the JSON file
npm run evalops -- dataset push ./datasets/fraud-golden-set.json

# Override the name
npm run evalops -- dataset push ./datasets/v2-samples.json --name="Fraud Detection v2"
```

**Output:**
```
Pushing dataset "Fraud Detection — Golden Set" (100 samples)...
✅ Dataset created: Fraud Detection — Golden Set (id: ds-abc123)
```

---

### `agent publish`

Publish an AgentMD agent definition to EvalOps. Creates a new versioned entry in the agents registry.

```bash
npm run evalops -- agent publish <agent.md>
```

**Options:**

| Flag | Description |
|------|-------------|
| `<agent.md>` | Path to the AgentMD file (positional) |
| `--version=<semver>` | Override the version from the front-matter |

**AgentMD file format:**

```markdown
---
name: fraud-detection-agent
version: "2.1.0"
description: Detects fraudulent transactions using LLM scoring
model:
  provider: anthropic
  name: claude-opus-4-7
  temperature: 0.0
tools:
  - transaction_lookup
  - risk_scoring
---
You are a fraud detection specialist. Given a transaction record,
identify whether it is fraudulent. Always explain your reasoning.
Output JSON: { decision, confidence, reasons }.
```

**Examples:**

```bash
# Publish using the version from the front-matter
npm run evalops -- agent publish ./agents/fraud-detection.md

# Publish with a version override
npm run evalops -- agent publish ./agents/fraud-detection.md --version=2.2.0-rc1
```

**Output:**
```
Publishing agent "fraud-detection-agent" v2.1.0...
✅ Agent published: fraud-detection-agent v2.1.0 (id: ag-xyz789)
```

---

### `policy check`

Print the policy verdict for a completed evaluation run. Exits `1` if the verdict is `fail`.

```bash
npm run evalops -- policy check <run-id>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<run-id>` | UUID of the run to inspect |

**Examples:**

```bash
# Check the verdict of a run
npm run evalops -- policy check run-789xyz

# Use in a script — exits 1 on fail
npm run evalops -- policy check $RUN_ID || echo "Quality gate failed!"
```

**Output (passing run):**
```
✅ Run: Production Quality Gates / 2024-01-15
   Decision: PASS (pass rate: 94.3%)
   Status:   completed
```

**Output (failing run):**
```
❌ Run: Production Quality Gates / 2024-01-15
   Decision: FAIL (pass rate: 61.0%)
   Status:   completed

   Policy violations:
  ❌ [FAIL] Minimum Pass Rate: pass rate 61% is below the 90% threshold
  ⚠️  [WARN] Cost Budget: $0.08 per run exceeds the $0.05 warning threshold
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Pass or warn |
| `1` | Fail |

---

### `doctor`

Check your local environment and connectivity to EvalOps. Run this when setting up a new machine or debugging connection issues.

```bash
npm run evalops -- doctor
```

**What it checks:**

| Check | Requirement |
|-------|-------------|
| Node.js version | v20 or later |
| Docker | Presence check (needed for local infra) |
| Auth | `EVALOPS_API_KEY` env var or `~/.evalops/credentials.json` |
| API Gateway | `GET /health` reachable at `EVALOPS_API_URL` |
| Per-service health | Each microservice on its expected port |
| Service env vars | `JWT_SECRET`, `SERVICE_SECRET` (only needed when running services locally) |

**Examples:**

```bash
# Standard check against localhost
npm run evalops -- doctor

# Check against a remote instance
EVALOPS_API_URL=https://evalops.internal npm run evalops -- doctor
```

**Output (healthy environment):**
```
EvalOps Doctor — environment check

  ✅  Node.js v20.19.0
  ✅  Docker  (28.2.2)
  ✅  Auth  (EVALOPS_API_KEY set via env)

  Checking connectivity to: http://localhost:3000
  ✅  API Gateway  (http://localhost:3000)
  ✅  auth-service  (:3001)
  ✅  core-service  (:3002)
  ✅  evaluation-service  (:3003)
  ✅  integration-service  (:3004)
  ✅  analytics-service  (:3005)
  ✅  Service env vars  (JWT_SECRET and SERVICE_SECRET set)

Everything looks good!
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | All critical checks passed |
| `1` | One or more critical checks failed |

---

## Utility Scripts

These scripts are available directly via `npm run` without the `evalops` prefix.

### `local-lint`

Run the AGENTS.md lint check locally — the same check that runs in CI on every PR.

```bash
npm run local-lint
```

Catches AGENTS.md violations (schema errors, size over 8KB) before you push. Use as a pre-push sanity check.

---

## CI / CD Usage

### Using environment variables (recommended for CI)

```yaml
# .github/workflows/your-workflow.yml
- name: Run eval gate
  run: npm run evalops -- eval run "Production Quality Gates" --watch
  env:
    EVALOPS_API_KEY: ${{ secrets.EVALOPS_API_KEY }}
    EVALOPS_API_URL: ${{ secrets.EVALOPS_API_URL }}
```

### Using the `evaluate-pr` composite action

For the full PR comment + JUnit artifact experience, use the bundled composite action:

```yaml
- uses: ./.github/actions/evaluate-pr
  with:
    suite-name: "Production Quality Gates"
    org-id: ${{ secrets.EVALOPS_ORG_ID }}
    api-key: ${{ secrets.EVALOPS_API_KEY }}
    api-url: ${{ secrets.EVALOPS_API_URL }}
    fail-on-warn: "true"
```

This posts a verdict comment directly on the PR and uploads JUnit results as a workflow artifact.

---

## Common Workflows

### New team onboarding

```bash
# 1. Log in
npm run evalops -- login --url=https://evalops.internal

# 2. Verify connectivity
npm run evalops -- doctor

# 3. Push your first dataset
npm run evalops -- dataset push ./test-data/golden-set.json

# 4. Run your first eval
npm run evalops -- eval run "My First Eval Spec" --watch
```

### Publishing a new agent version

```bash
# Bump the version in the front-matter, then publish
npm run evalops -- agent publish ./agents/my-agent.md

# Verify the publish
npm run evalops -- eval run "Agent Regression Suite" --watch
```

### Debugging a failed CI run

```bash
# Get the run ID from CI logs, then inspect locally
npm run evalops -- policy check <run-id-from-ci>
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Not authenticated. Run evalops login` | Run `npm run evalops -- login` or set `EVALOPS_API_KEY` |
| `HTTP 401: Unauthorized` | Token may be expired — run `npm run evalops -- login` again |
| `HTTP 404: Suite not found` | Check the suite name with a space; names are case-sensitive |
| `API Gateway unreachable` | Run `npm run evalops -- doctor` to identify which service is down |
| `Eval spec "X" not found` | List available specs via the UI at `http://localhost:4200` or check the name spelling |
| `File not found: ./my-dataset.json` | Path is relative to where you run the command, not the repo root |
