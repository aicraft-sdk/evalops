# CI Gates

## Overview

CI Gates enable running simulation suites as part of your CI/CD pipeline to enforce quality gates before merging or deploying code. When policy violations occur, the CI build fails and review queue items are automatically created with the `ci_gate` tag for tracking.

## Features

- **Automated Quality Gates**: Run simulation suites in CI/CD pipelines
- **Policy-Based Failures**: Build fails on policy violations (configurable for warnings)
- **Commit SHA Tracking**: All runs are associated with the commit SHA for traceability
- **Review Queue Integration**: Violations automatically create review queue items tagged with `ci_gate`
- **JUnit XML Output**: Results formatted for CI tool integration (GitHub Actions, GitLab CI, etc.)
- **JSON Summary**: Detailed JSON output for programmatic access

## Setup

### GitHub Actions

The simulation gates job is configured in `.github/workflows/ci.yml`. It runs automatically on pull requests and main branch pushes.

**Required Secrets:**

- `EVALOPS_API_KEY`: JWT token for API authentication
- `EVALOPS_SIMULATION_SUITE_ID`: UUID of the simulation suite to run
- `EVALOPS_ORG_ID`: UUID of your organization

**Optional Configuration:**

The job can be customized by modifying the workflow file:

```yaml
- name: Run simulation suite
  run: |
    npx nx run evaluation-service:run-suite \
      --suite-id=${{ secrets.EVALOPS_SIMULATION_SUITE_ID }} \
      --org-id=${{ secrets.EVALOPS_ORG_ID }} \
      --fail-on-warn=true \
      --output-format=junit \
      --output-dir=./test-results \
      --commit-sha=${{ github.sha }}
```

### Other CI Systems

For other CI systems (GitLab CI, CircleCI, Jenkins, etc.), add a job that:

1. Starts the EvalOps services (or connects to an existing instance)
2. Runs the CLI command: `npx nx run evaluation-service:run-suite`
3. Checks the exit code (non-zero on failures)

**Example GitLab CI:**

```yaml
simulation-gates:
  script:
    - npm ci
    - npm run db:push
    - npm run dev &
    - sleep 30  # Wait for services
    - npx nx run evaluation-service:run-suite \
        --suite-id=$EVALOPS_SIMULATION_SUITE_ID \
        --org-id=$EVALOPS_ORG_ID \
        --fail-on-warn=true \
        --commit-sha=$CI_COMMIT_SHA
  variables:
    EVALOPS_API_KEY: $EVALOPS_API_KEY
    EVALOPS_SIMULATION_SUITE_ID: $EVALOPS_SIMULATION_SUITE_ID
    EVALOPS_ORG_ID: $EVALOPS_ORG_ID
```

## CLI Command

See [CLI_REFERENCE.md](CLI_REFERENCE.md) for complete CLI documentation.

**Basic Usage:**

```bash
npx nx run evaluation-service:run-suite \
  --suite-id=<suite-uuid> \
  --org-id=<org-uuid> \
  --fail-on-warn=true \
  --commit-sha=$(git rev-parse HEAD)
```

## Output Formats

### JUnit XML

JUnit XML output is generated for CI tool integration. Failed scenarios appear as test failures, warnings as skipped tests.

**Location:** `./test-results/simulation-results.xml` (configurable via `--output-dir`)

**GitHub Actions Integration:**

The workflow automatically uploads JUnit results as artifacts. Results also appear in the Actions UI if your CI tool supports JUnit XML.

### JSON Summary

JSON summary provides detailed information about the run:

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
  "runs": [...]
}
```

## Review Queue Integration

When policy violations occur during CI runs:

1. **Review Queue Items**: Automatically created for each violation
2. **CI Tag**: Items are tagged with `ci_gate` for filtering
3. **Commit SHA**: Items are linked to the run, which includes the commit SHA
4. **Priority**: Violations are marked as high priority

**Filtering CI-Generated Items:**

In the review queue UI, filter by tag `ci_gate` to see only items created from CI runs.

**API Query:**

```bash
GET /api/evaluation/reviews/queue-items?tags[]=ci_gate
```

## Exit Codes

The CLI command exits with:

- `0`: All scenarios passed (or warnings only if `--fail-on-warn=false`)
- `1`: One or more scenarios failed (or warnings if `--fail-on-warn=true`)

CI systems interpret non-zero exit codes as build failures.

## Commit SHA Tracking

All runs executed via CI are automatically associated with the commit SHA:

1. **CI Environment Variables**: Automatically detected from:
   - `GITHUB_SHA` (GitHub Actions)
   - `CI_COMMIT_SHA` (GitLab CI)
   - `CI_COMMIT` (CircleCI, Travis CI)
   - `COMMIT_SHA` (Generic CI)

2. **Git Fallback**: If no CI variable is set, falls back to `git rev-parse HEAD`

3. **Manual Override**: Can be explicitly set via `--commit-sha` flag

The commit SHA is stored in the `runs.commit_sha` column and appears in:
- Run details UI
- Review queue items (via run link)
- JSON summaries
- API responses

## Troubleshooting

### Services Not Starting

If services fail to start in CI:

1. Check database connection: `DATABASE_URL` must be correct
2. Verify Redis is accessible: `REDIS_HOST` and `REDIS_PORT`
3. Check service logs in CI output
4. Ensure migrations ran: `npm run db:push`

### Authentication Failures

If authentication fails:

1. Verify `EVALOPS_API_KEY` secret is set correctly
2. Check token hasn't expired (JWT tokens may expire)
3. Ensure organization ID matches the token's organization

### Suite Not Found

If the suite ID is not found:

1. Verify `EVALOPS_SIMULATION_SUITE_ID` matches an existing suite
2. Check the suite belongs to the organization (`EVALOPS_ORG_ID`)
3. Ensure the suite is active/enabled

### Timeout Issues

If runs timeout:

1. Increase timeout: `--timeout=<seconds>` (default: 600)
2. Check service health endpoints
3. Review scenario complexity (some scenarios may take longer)

## Best Practices

1. **Start Small**: Begin with a small suite of critical scenarios
2. **Monitor Costs**: CI runs consume AI provider tokens
3. **Use Fail-on-Warn Sparingly**: Only enable `--fail-on-warn` for critical quality gates
4. **Review Queue**: Regularly review `ci_gate` tagged items
5. **Commit SHA**: Always ensure commit SHA is tracked for traceability
6. **Parallel Runs**: Consider running multiple suites in parallel for different concerns

## Related Documentation

- [CLI_REFERENCE.md](CLI_REFERENCE.md) - Complete CLI command reference
- [LOCAL_DEV.md](LOCAL_DEV.md) - Local development setup
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
