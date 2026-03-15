# CLI Reference

## Overview

The EvalOps CLI provides command-line tools for running simulation suites, managing runs, and integrating with CI/CD pipelines.

## Installation

The CLI is included in the EvalOps monorepo. No separate installation is required when working within the repository.

**Using Nx:**

```bash
npx nx run evaluation-service:run-suite [options]
```

**Direct Execution:**

```bash
tsx apps/evaluation-service/src/cli/run-suite.ts [options]
```

## Commands

### run-suite

Run a simulation suite and wait for completion.

**Usage:**

```bash
npx nx run evaluation-service:run-suite [options]
```

**Options:**

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--suite-id=<uuid>` | Yes* | - | UUID of the simulation suite to run |
| `--suite-name=<name>` | Yes* | - | Name of the simulation suite (alternative to `--suite-id`) |
| `--org-id=<uuid>` | Yes | - | UUID of your organization |
| `--fail-on-warn` | No | `false` | Exit with non-zero code on warnings |
| `--output-format=<format>` | No | `both` | Output format: `junit`, `json`, or `both` |
| `--output-dir=<path>` | No | `./test-results` | Directory for output files |
| `--timeout=<seconds>` | No | `600` | Maximum time to wait for completion (seconds) |
| `--commit-sha=<sha>` | No | Auto-detect | Git commit SHA to associate with runs |

\* Either `--suite-id` or `--suite-name` must be provided.

**Examples:**

```bash
# Run suite by ID
npx nx run evaluation-service:run-suite \
  --suite-id=abc123-def456-ghi789 \
  --org-id=org-123 \
  --fail-on-warn=true

# Run suite by name
npx nx run evaluation-service:run-suite \
  --suite-name="Production Quality Gates" \
  --org-id=org-123 \
  --output-format=junit

# With commit SHA
npx nx run evaluation-service:run-suite \
  --suite-id=abc123-def456-ghi789 \
  --org-id=org-123 \
  --commit-sha=$(git rev-parse HEAD)

# JSON output only
npx nx run evaluation-service:run-suite \
  --suite-id=abc123-def456-ghi789 \
  --org-id=org-123 \
  --output-format=json \
  --output-dir=./results
```

## Authentication

The CLI supports two authentication methods:

### JWT Token (Recommended)

Set `EVALOPS_API_KEY` environment variable with a JWT token:

```bash
export EVALOPS_API_KEY="your-jwt-token"
npx nx run evaluation-service:run-suite --suite-id=... --org-id=...
```

### Service Token

For service-to-service authentication, set `EVALOPS_SERVICE_TOKEN`:

```bash
export EVALOPS_SERVICE_TOKEN="your-service-token"
npx nx run evaluation-service:run-suite --suite-id=... --org-id=...
```

**Note:** At least one authentication method must be configured. JWT tokens are preferred for user-initiated runs.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EVALOPS_API_KEY` | Yes* | JWT token for API authentication |
| `EVALOPS_SERVICE_TOKEN` | Yes* | Service token for service-to-service auth |
| `EVALOPS_API_URL` | No | API base URL (default: `http://localhost:3000`) |

\* Either `EVALOPS_API_KEY` or `EVALOPS_SERVICE_TOKEN` must be set.

## Output Formats

### JUnit XML

JUnit XML format for CI tool integration:

**File:** `{output-dir}/simulation-results.xml`

**Structure:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Simulation Suite: Suite Name" tests="5" failures="1" errors="0" skipped="1" time="120">
    <testcase name="Scenario Name" classname="Suite Name" time="25">
      <failure message="Policy violation message">
        <![CDATA[Policy Name (fail): Policy violation message - Evidence: {...}]]>
      </failure>
    </testcase>
    ...
  </testsuite>
</testsuites>
```

**CI Integration:**

- **GitHub Actions**: Results appear in Actions UI and can be uploaded as artifacts
- **GitLab CI**: Use `junit` report type in `.gitlab-ci.yml`
- **Jenkins**: Use JUnit plugin to parse results

### JSON Summary

JSON format for programmatic access:

**File:** `{output-dir}/simulation-summary.json`

**Structure:**

```json
{
  "suiteId": "suite-123",
  "suiteName": "Production Quality Gates",
  "commitSha": "abc123def456",
  "startedAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:01:00Z",
  "totalScenarios": 5,
  "passed": 3,
  "warned": 1,
  "failed": 1,
  "overallDecision": "fail",
  "runs": [
    {
      "runId": "run-123",
      "scenarioId": "scenario-123",
      "scenarioName": "Test Scenario",
      "status": "completed",
      "decision": "fail",
      "policyScore": 50,
      "violations": [
        {
          "policyId": "policy-123",
          "policyName": "Test Policy",
          "severity": "fail",
          "message": "Policy violation message"
        }
      ],
      "duration": 200,
      "cost": 0.01
    }
  ]
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success - All scenarios passed (or warnings only if `--fail-on-warn=false`) |
| `1` | Failure - One or more scenarios failed (or warnings if `--fail-on-warn=true`) |

**CI Integration:**

Non-zero exit codes cause CI builds to fail, enabling quality gates.

## Commit SHA Detection

The CLI automatically detects the commit SHA from CI environment variables:

**Priority Order:**

1. `GITHUB_SHA` (GitHub Actions)
2. `CI_COMMIT_SHA` (GitLab CI)
3. `CI_COMMIT` (CircleCI, Travis CI)
4. `COMMIT_SHA` (Generic CI)
5. `git rev-parse HEAD` (Git fallback)

**Manual Override:**

```bash
--commit-sha=abc123def456
```

The commit SHA is stored in the `runs.commit_sha` column and appears in:
- Run details UI
- Review queue items
- JSON summaries
- API responses

## Error Handling

### Authentication Errors

```
Error: Authentication required: Set EVALOPS_API_KEY (JWT) or EVALOPS_SERVICE_TOKEN (service token)
```

**Solution:** Set `EVALOPS_API_KEY` or `EVALOPS_SERVICE_TOKEN` environment variable.

### Suite Not Found

```
Error: Suite not found: suite-123
```

**Solution:** Verify the suite ID exists and belongs to your organization.

### Timeout

```
Error: Suite execution timed out after 600 seconds
```

**Solution:** Increase timeout with `--timeout=<seconds>` or investigate slow scenarios.

### Network Errors

```
Error: Request failed with status code 500
```

**Solution:** Check service health endpoints and logs.

## Examples

### CI/CD Integration

**GitHub Actions:**

```yaml
- name: Run simulation gates
  run: |
    npx nx run evaluation-service:run-suite \
      --suite-id=${{ secrets.EVALOPS_SIMULATION_SUITE_ID }} \
      --org-id=${{ secrets.EVALOPS_ORG_ID }} \
      --fail-on-warn=true \
      --output-format=junit \
      --commit-sha=${{ github.sha }}
  env:
    EVALOPS_API_KEY: ${{ secrets.EVALOPS_API_KEY }}
```

### Local Testing

```bash
# Set authentication
export EVALOPS_API_KEY="your-token"
export EVALOPS_API_URL="http://localhost:3000"

# Run suite
npx nx run evaluation-service:run-suite \
  --suite-name="Local Test Suite" \
  --org-id=your-org-id \
  --output-format=both \
  --output-dir=./results
```

### Scripted Execution

```bash
#!/bin/bash
set -e

SUITE_ID="abc123-def456-ghi789"
ORG_ID="org-123"
COMMIT_SHA=$(git rev-parse HEAD)

npx nx run evaluation-service:run-suite \
  --suite-id="$SUITE_ID" \
  --org-id="$ORG_ID" \
  --fail-on-warn=true \
  --output-format=junit \
  --commit-sha="$COMMIT_SHA"

echo "Simulation gates passed!"
```

## Related Documentation

- [CI_GATES.md](CI_GATES.md) - CI/CD integration guide
- [LOCAL_DEV.md](LOCAL_DEV.md) - Local development setup
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
