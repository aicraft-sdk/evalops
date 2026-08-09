# OpenSandbox Integration Testing Guide

This guide provides comprehensive instructions for testing the OpenSandbox integration in EvalOps, covering unit tests, integration tests, manual testing, and end-to-end workflows.

## Prerequisites

Before testing, ensure:

1. **OpenSandbox Server is Running**:

   ```bash
   # Check if running
   curl http://localhost:8080/health

   # If not running, start it
   opensandbox-server start
   ```

2. **Environment Variables Configured**:

   ```bash
   # Verify .env has OpenSandbox configuration
   grep OPENSANDBOX .env
   ```

3. **Docker is Running**:

   ```bash
   docker ps
   ```

4. **Dependencies Installed**:
   ```bash
   npm install
   cd python_worker && pip install -r requirements.txt
   ```

## Test Structure

### Unit Tests

Unit tests mock external dependencies and test individual service methods:

**Location**: `apps/*/src/**/*.spec.ts` and `libs/*/src/**/*.spec.ts`

**Key Test Files**:

- `libs/core-integration/src/lib/sandbox/sandbox.service.spec.ts` - SandboxService unit tests
- `libs/core-integration/src/lib/sandbox/sandbox-security.service.spec.ts` - Security service tests
- `apps/evaluation-service/src/app/sandbox-execution/sandbox-execution.service.spec.ts` - Execution service tests

**Run Unit Tests**:

```bash
# All unit tests
npm run test:unit

# Specific project
nx test core-integration --testFile=sandbox.service.spec.ts
nx test evaluation-service --testFile=sandbox-execution.service.spec.ts
```

### Integration Tests

Integration tests verify end-to-end workflows with mocked OpenSandbox server:

**Location**: `apps/*/src/__tests__/*.integration.test.ts`

**Key Test Files**:

- `apps/evaluation-service/src/__tests__/sandbox-execution.integration.test.ts` - Full execution workflows

**Run Integration Tests**:

```bash
# All integration tests
npm run test:e2e

# Specific test file
nx test evaluation-service --testFile=sandbox-execution.integration.test.ts
```

## Manual Testing

### 1. Test Sandbox Creation

**Via API**:

```bash
# Create a sandbox
curl -X POST http://localhost:3000/api/sandboxes \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "cpu": "1.0",
      "memory": "512Mi",
      "timeout": 300
    }
  }'
```

**Expected Response**:

```json
{
  "sandboxId": "sandbox-abc123..."
}
```

**Via Service** (TypeScript):

```typescript
import { SandboxService } from '@evalops/core-integration';

const sandboxId = await sandboxService.createSandbox({
  cpu: '1.0',
  memory: '512Mi',
  timeout: 300,
});
console.log('Created sandbox:', sandboxId);
```

### 2. Test Code Execution

**Via API**:

```bash
# Execute Python code
curl -X POST http://localhost:3000/api/sandboxes/<sandbox-id>/execute \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def hello(): return \"world\"",
    "language": "python",
    "input": {}
  }'
```

**Expected Response**:

```json
{
  "output": "world",
  "executionTime": 123,
  "exitCode": 0,
  "resourceUsage": {
    "cpu": 0.5,
    "memory": 256000
  }
}
```

**Via Service**:

```typescript
import { SandboxExecutionService } from '@evalops/evaluation-service';

const result = await sandboxExecutionService.executeCode(
  'def calculate(x): return x * 2',
  'python',
  { x: 5 }
);
console.log('Result:', result.output); // 10
```

### 3. Test Custom Evaluator Execution

**Prerequisites**:

1. Create a custom evaluator via Core Service API
2. Upload evaluator code file
3. Set evaluator status to `active`

**Via Service**:

```typescript
import { SandboxExecutionService } from '@evalops/evaluation-service';

const result = await sandboxExecutionService.executeCustomEvaluator(
  'evaluator-123',
  {
    prompt: 'What is the capital of France?',
    response: 'Paris',
  },
  'run-456'
);

console.log('Score:', result.score);
console.log('Output:', result.output);
```

**Expected Result**:

```json
{
  "evaluatorId": "evaluator-123",
  "runId": "run-456",
  "score": 1.0,
  "output": {
    "score": 1.0,
    "reasoning": "Exact match"
  },
  "executionTime": 234
}
```

### 4. Test Python Worker Code Execution

**Via Python Worker API**:

```bash
curl -X POST http://localhost:5055/execute-code \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import math; print(math.sqrt(16))",
    "language": "python",
    "input_data": {},
    "timeout_seconds": 30
  }'
```

**Expected Response**:

```json
{
  "task_id": "task-abc123",
  "status": "completed",
  "result": {
    "output": "4.0",
    "stdout": ["4.0"],
    "stderr": [],
    "exit_code": 0
  },
  "execution_time_ms": 456
}
```

### 5. Test Security Features

#### Network Policy Enforcement

**Test Restricted Policy**:

```typescript
// This should fail - domain not in allowlist
try {
  await sandboxService.createSandbox({
    networkPolicy: 'restricted',
    allowedDomains: ['malicious-site.com'], // Not allowed
  });
} catch (error) {
  console.log('Expected error:', error.message);
}
```

**Test Allowed Domain**:

```typescript
// This should succeed
const sandboxId = await sandboxService.createSandbox({
  networkPolicy: 'restricted',
  allowedDomains: ['api.openai.com'], // In allowlist
});
```

#### Resource Limits

**Test CPU Limit**:

```typescript
// This should fail - exceeds max CPU
try {
  await sandboxService.createSandbox({
    cpu: '5.0', // Exceeds max (2.0)
  });
} catch (error) {
  console.log('Expected error:', error.message);
}
```

**Test Memory Limit**:

```typescript
// This should fail - exceeds max memory
try {
  await sandboxService.createSandbox({
    memory: '10Gi', // Exceeds max (2Gi)
  });
} catch (error) {
  console.log('Expected error:', error.message);
}
```

#### Code Validation

**Test Blocked Import**:

```typescript
// This should fail - blocked import
try {
  await sandboxExecutionService.executeCode(
    'import os; os.system("rm -rf /")',
    'python'
  );
} catch (error) {
  console.log('Expected error:', error.message);
  // Should contain "Blocked Python import"
}
```

**Test Allowed Code**:

```typescript
// This should succeed
const result = await sandboxExecutionService.executeCode(
  'def add(a, b): return a + b',
  'python',
  { a: 1, b: 2 }
);
console.log('Result:', result.output); // 3
```

### 6. Test Evaluation Workflow with Custom Evaluator

**Full Workflow**:

1. **Create Dataset**:

   ```bash
   curl -X POST http://localhost:3000/api/core/datasets \
     -H "Authorization: Bearer <token>" \
     -d '{
       "name": "Test Dataset",
       "samples": [
         {
           "input": "What is 2+2?",
           "expected": "4"
         }
       ]
     }'
   ```

2. **Create Custom Evaluator**:

   ```bash
   curl -X POST http://localhost:3000/api/core/custom-evaluators \
     -H "Authorization: Bearer <token>" \
     -d '{
       "name": "Exact Match",
       "executionType": "sandbox",
       "fileName": "exact_match.py"
     }'
   ```

3. **Upload Evaluator Code**:

   ```bash
   curl -X POST http://localhost:3000/api/core/custom-evaluators/<id>/upload \
     -H "Authorization: Bearer <token>" \
     -F "file=@exact_match.py"
   ```

4. **Create Eval Spec**:

   ```bash
   curl -X POST http://localhost:3000/api/core/eval-specs \
     -H "Authorization: Bearer <token>" \
     -d '{
       "datasetId": "<dataset-id>",
       "promptId": "<prompt-id>",
       "evaluators": [
         {
           "type": "custom",
           "evaluatorId": "<evaluator-id>"
         }
       ]
     }'
   ```

5. **Create Run**:

   ```bash
   curl -X POST http://localhost:3000/api/evaluation/runs \
     -H "Authorization: Bearer <token>" \
     -d '{
       "evalSpecId": "<eval-spec-id>"
     }'
   ```

6. **Check Run Status**:
   ```bash
   curl http://localhost:3000/api/evaluation/runs/<run-id> \
     -H "Authorization: Bearer <token>"
   ```

**Expected**: Run should complete with custom evaluator scores populated.

## End-to-End Test Scenarios

### Scenario 1: Simple Code Execution

**Goal**: Verify basic sandbox code execution works.

**Steps**:

1. Create sandbox
2. Execute simple Python code
3. Verify output
4. Delete sandbox

**Expected**: Code executes successfully, output is correct, sandbox is cleaned up.

### Scenario 2: Custom Evaluator in Evaluation Run

**Goal**: Verify custom evaluator executes during evaluation run.

**Steps**:

1. Create custom evaluator
2. Create eval spec with custom evaluator
3. Create and run evaluation
4. Verify custom evaluator scores are populated

**Expected**: Evaluation completes with custom evaluator scores.

### Scenario 3: Security Violation Handling

**Goal**: Verify security policies block dangerous code.

**Steps**:

1. Attempt to execute code with blocked import
2. Verify error is returned
3. Verify audit log is created

**Expected**: Execution fails with security error, audit log records violation.

### Scenario 4: Resource Limit Enforcement

**Goal**: Verify resource limits are enforced.

**Steps**:

1. Attempt to create sandbox with excessive resources
2. Verify error is returned
3. Create sandbox with valid resources
4. Verify sandbox is created

**Expected**: Invalid resources rejected, valid resources accepted.

### Scenario 5: Network Isolation

**Goal**: Verify network policies block unauthorized domains.

**Steps**:

1. Create sandbox with restricted network policy
2. Execute code that attempts network call to blocked domain
3. Verify network call is blocked

**Expected**: Network call fails, sandbox remains isolated.

## Debugging Tests

### Test Failures

**Common Issues**:

1. **OpenSandbox Server Not Running**:

   ```bash
   # Check server status
   curl http://localhost:8080/health

   # Start server
   opensandbox-server start
   ```

2. **API Key Mismatch**:

   ```bash
   # Verify keys match
   grep OPENSANDBOX_API_KEY .env
   grep api_key ~/.sandbox.toml
   ```

3. **Docker Not Running**:

   ```bash
   docker ps
   # Start Docker if needed
   ```

4. **Port Conflicts**:
   ```bash
   # Check if port is in use
   lsof -i :8080
   # Change port in ~/.sandbox.toml if needed
   ```

### Test Logs

**View Service Logs**:

```bash
# Integration service logs
npm run dev:integration | grep sandbox

# Evaluation service logs
npm run dev:evaluation | grep sandbox

# Python worker logs
cd python_worker && python main.py | grep sandbox
```

**View OpenSandbox Server Logs**:

```bash
# Logs are typically in ~/.sandbox/logs/
tail -f ~/.sandbox/logs/server.log
```

### Test Metrics

**Check Sandbox Metrics** (if monitoring enabled):

```bash
# Metrics endpoint (if implemented) — via API Gateway, routed to core-service
curl http://localhost:3000/api/sandboxes/metrics \
  -H "Authorization: Bearer <token>"
```

## Performance Testing

### Load Testing

**Test Concurrent Sandboxes**:

```typescript
const promises = Array.from({ length: 10 }, (_, i) =>
  sandboxService.createSandbox({}, `user-${i}`, `org-1`)
);
const sandboxIds = await Promise.all(promises);
console.log(`Created ${sandboxIds.length} sandboxes`);
```

**Test Execution Throughput**:

```typescript
const start = Date.now();
const executions = await Promise.all(
  Array.from({ length: 50 }, () =>
    sandboxExecutionService.executeCode('print("test")', 'python')
);
const duration = Date.now() - start;
console.log(`Executed ${executions.length} in ${duration}ms`);
```

## Continuous Integration Testing

### CI Test Setup

**GitHub Actions Example**:

```yaml
name: Test OpenSandbox Integration

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      docker:
        image: docker:latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Start OpenSandbox Server
        run: |
          pip install opensandbox-server
          opensandbox-server start &
      - name: Run Tests
        run: npm test
```

## Test Coverage Goals

**Target Coverage**:

- **Unit Tests**: > 80% coverage for sandbox services
- **Integration Tests**: All critical workflows covered
- **Security Tests**: All security features tested
- **Performance Tests**: Resource limits and concurrent execution tested

**Check Coverage**:

```bash
npm test --coverage
```

## Troubleshooting

See [SANDBOX_INTEGRATION.md](./SANDBOX_INTEGRATION.md#troubleshooting) for detailed troubleshooting guide.

## Next Steps

After verifying tests pass:

1. **Review Security Configuration**: Ensure production settings are secure
2. **Monitor Metrics**: Set up monitoring dashboards
3. **Load Testing**: Test with expected production load
4. **Documentation Review**: Ensure all docs are up to date
5. **Security Review**: Conduct security audit

## Related Documentation

- [SANDBOX_INTEGRATION.md](./SANDBOX_INTEGRATION.md) - Integration guide
- [OPENSANDBOX_SETUP.md](./OPENSANDBOX_SETUP.md) - Server setup
- [SANDBOX_SECURITY.md](./SANDBOX_SECURITY.md) - Security features
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
