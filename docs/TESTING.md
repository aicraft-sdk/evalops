# Testing Guide

This guide provides comprehensive instructions for testing EvalOps locally, including unit tests, integration tests, end-to-end tests, and manual testing workflows.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Manual Testing](#manual-testing)
- [Testing Features End-to-End](#testing-features-end-to-end)
- [Debugging Tests](#debugging-tests)
- [Test Coverage](#test-coverage)

## Prerequisites

Before running tests, ensure:

1. **Dependencies Installed**:

   ```bash
   npm install
   ```

2. **Database Running**:

   ```bash
   # With Tilt
   tilt up

   # Or manually
   docker run -d --name evalops-postgres \
     -p 5432:5432 \
     -e POSTGRES_DB=evalops \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     postgres:15-alpine
   ```

3. **Environment Variables Configured**:

   ```bash
   cp .env.example .env
   # Edit .env with required variables (JWT_SECRET, SERVICE_SECRET, DATABASE_URL)
   ```

4. **Database Schema Applied**:
   ```bash
   npm run db:push
   ```

## Running Tests

### Run All Tests

```bash
# Run all tests (unit + integration)
npm test

# Run with coverage report
npm test -- --coverage
```

### Run Tests by Type

```bash
# Unit tests only
npm run test:unit

# Integration/E2E tests only
npm run test:e2e
```

### Run Tests for Specific Project

```bash
# Test a specific service
nx test auth-service
nx test core-service
nx test evaluation-service
nx test integration-service
nx test analytics-service

# Test a specific library
nx test sdk
nx test evaluators
nx test agent-md
nx test shared-db
```

### Run Specific Test File

```bash
# Run a specific test file
nx test evaluation-service --testFile=evaluation.service.spec.ts

# Run tests matching a pattern
nx test evaluation-service --testNamePattern="should create evaluation run"
```

### Watch Mode

```bash
# Watch mode for development
nx test evaluation-service --watch

# Watch mode with coverage
nx test evaluation-service --watch --coverage
```

### Run Tests for Affected Projects

```bash
# Only test projects affected by your changes
nx affected:test

# With coverage
nx affected:test --coverage
```

## Test Structure

### File Organization

```
evalops/
├── apps/
│   ├── auth-service/
│   │   └── src/
│   │       ├── **/*.spec.ts          # Unit tests (co-located)
│   │       └── __tests__/
│   │           └── *.integration.test.ts  # Integration tests
│   ├── core-service/
│   │   └── src/
│   │       ├── **/*.spec.ts
│   │       └── __tests__/
│   │           └── *.integration.test.ts
│   └── ...
├── libs/
│   ├── sdk/
│   │   └── src/
│   │       └── **/*.spec.ts          # Library unit tests
│   └── evaluators/
│       └── src/
│           └── **/*.spec.ts
└── tests/
    └── e2e/
        └── *.spec.ts                 # Playwright E2E tests
```

### Naming Conventions

- **Unit tests**: `*.spec.ts` (co-located with source files)
- **Integration tests**: `*.integration.test.ts` (in `__tests__/` directories)
- **E2E tests**: `*.spec.ts` (in `tests/e2e/` directory)

## Unit Testing

Unit tests test individual functions, classes, and modules in isolation with mocked dependencies.

### Example Unit Test

```typescript
import { Test } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-jest';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { EvaluationService } from './evaluation.service';
import { RunsService } from '../runs/runs.service';

describe('EvaluationService', () => {
  let service: EvaluationService;
  let runsService: jest.Mocked<RunsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EvaluationService,
        {
          provide: RunsService,
          useValue: createMock<RunsService>(),
        },
      ],
    }).compile();

    service = module.get(EvaluationService);
    runsService = module.get(RunsService);
  });

  describe('createRun', () => {
    it('should create a new evaluation run', async () => {
      const evalSpec = { id: 'spec-1', datasetId: 'dataset-1' };
      runsService.create.mockResolvedValue({ id: 'run-1', status: 'pending' });

      const result = await service.createRun(evalSpec);

      expect(result).toEqual({ id: 'run-1', status: 'pending' });
      expect(runsService.create).toHaveBeenCalledWith(evalSpec);
    });

    it('should handle errors gracefully', async () => {
      runsService.create.mockRejectedValue(new Error('Database error'));

      await expect(service.createRun({ id: 'spec-1' })).rejects.toThrow(
        'Database error'
      );
    });
  });
});
```

### Running Unit Tests

```bash
# All unit tests
npm run test:unit

# Specific service
nx test evaluation-service --testPathPattern=spec

# Watch mode
nx test evaluation-service --watch
```

## Integration Testing

Integration tests verify component interactions and external service integrations.

### Example Integration Test

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';

describe('Evaluation API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login to get token
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Test123!' });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test123!' });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create an evaluation run', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/evaluation/runs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ evalSpecId: 'spec-1' })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.status).toBe('pending');
  });
});
```

### Running Integration Tests

```bash
# All integration tests
npm run test:e2e

# Specific test file
nx test evaluation-service --testFile=*.integration.test.ts
```

## End-to-End Testing

E2E tests use Playwright to test the full application stack including the frontend.

### Example E2E Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Evaluation Workflow', () => {
  test('should complete full evaluation workflow', async ({ page }) => {
    // Navigate to evaluation page
    await page.goto('/evaluations');

    // Create a dataset
    await page.click('[data-testid="button-create-dataset"]');
    await page.fill('[data-testid="input-dataset-name"]', 'Test Dataset');
    await page.click('[data-testid="button-submit"]');

    // Create a prompt
    await page.click('[data-testid="button-create-prompt"]');
    await page.fill('[data-testid="input-prompt-name"]', 'Test Prompt');
    await page.fill(
      '[data-testid="textarea-prompt-content"]',
      'Answer: {{input}}'
    );
    await page.click('[data-testid="button-submit"]');

    // Create eval spec
    await page.click('[data-testid="button-create-eval-spec"]');
    await page.selectOption('[data-testid="select-dataset"]', 'Test Dataset');
    await page.selectOption('[data-testid="select-prompt"]', 'Test Prompt');
    await page.click('[data-testid="button-submit"]');

    // Run evaluation
    await page.click('[data-testid="button-run-evaluation"]');

    // Wait for completion
    await expect(page.locator('[data-testid="run-status"]')).toHaveText(
      'completed',
      { timeout: 30000 }
    );
  });
});
```

### Running E2E Tests

```bash
# Run Playwright E2E tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/evaluation-workflow.spec.ts

# Run in UI mode
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed
```

## Manual Testing

Manual testing is useful for verifying features work correctly in a real environment.

### 1. Start All Services

```bash
# Option A: Using Tilt (recommended)
tilt up

# Option B: Manual start
npm run dev
```

### 2. Access the Application

- **Frontend**: http://localhost:4200
- **API Gateway**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api/docs

### 3. Register and Login

```bash
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

Save the `accessToken` from the login response for authenticated requests.

## Testing Features End-to-End

### Testing Evaluation Workflow

#### 1. Create a Dataset

```bash
TOKEN="your-access-token"

curl -X POST http://localhost:3000/api/core/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Math Questions",
    "description": "Simple math problems",
    "samples": [
      {"input": "What is 2 + 2?", "expectedOutput": "4"},
      {"input": "What is 5 * 3?", "expectedOutput": "15"}
    ]
  }'
```

Save the returned `id` as `DATASET_ID`.

#### 2. Create a Prompt

```bash
curl -X POST http://localhost:3000/api/core/prompts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Math Assistant",
    "content": "Answer this math question: {{input}}",
    "version": "1.0"
  }'
```

Save the returned `id` as `PROMPT_ID`.

#### 3. Create an Eval Spec

```bash
curl -X POST http://localhost:3000/api/core/eval-specs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Math Accuracy Test\",
    \"datasetId\": \"$DATASET_ID\",
    \"promptId\": \"$PROMPT_ID\",
    \"evaluators\": [{\"type\": \"exact_match\"}],
    \"modelConfig\": {\"model\": \"gpt-4o-mini\"},
    \"repetitions\": 1
  }"
```

Save the returned `id` as `SPEC_ID`.

#### 4. Run the Evaluation

```bash
curl -X POST http://localhost:3000/api/evaluation/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"evalSpecId\": \"$SPEC_ID\"}"
```

Save the returned `id` as `RUN_ID`.

#### 5. Check Run Status

```bash
curl http://localhost:3000/api/evaluation/runs/$RUN_ID \
  -H "Authorization: Bearer $TOKEN"
```

Wait until `status` is `completed`.

#### 6. View Results

```bash
curl http://localhost:3000/api/evaluation/runs/$RUN_ID/results \
  -H "Authorization: Bearer $TOKEN"
```

Or view in the frontend at: http://localhost:4200/runs/$RUN_ID

### Testing Trace Ingestion

#### 1. Ingest Trace Events

```bash
curl -X POST http://localhost:3000/api/evaluation/ingestion/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"runId\": \"$RUN_ID\",
    \"events\": [
      {
        \"type\": \"assistant_message\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"data\": {
          \"content\": \"The answer is 4\",
          \"tokenUsage\": {\"prompt\": 10, \"completion\": 5}
        }
      }
    ]
  }"
```

#### 2. Verify Events Stored

```bash
curl http://localhost:3000/api/evaluation/runs/$RUN_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.traceEvents'
```

### Testing Custom Evaluators (OpenSandbox)

See **[docs/SANDBOX_TESTING.md](SANDBOX_TESTING.md)** for detailed OpenSandbox testing instructions.

Quick test:

```bash
# 1. Ensure OpenSandbox server is running
curl http://localhost:8080/health

# 2. Create a custom evaluator
curl -X POST http://localhost:3000/api/core/evaluators \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Quality Checker",
    "code": "def evaluate(output):\n    return {\"score\": 0.9, \"reason\": \"Good\"}"
  }'

# 3. Use in eval spec
# Add evaluator to eval spec's evaluators array
```

## Debugging Tests

### Common Issues

#### 1. Database Connection Errors

```bash
# Verify database is running
docker ps --filter name=evalops-postgres

# Check DATABASE_URL in .env
grep DATABASE_URL .env

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

#### 2. Test Timeouts

Increase timeout in test files:

```typescript
jest.setTimeout(30000); // 30 seconds
```

Or in `jest.config.js`:

```javascript
module.exports = {
  testTimeout: 30000,
};
```

#### 3. Mock Issues

Ensure mocks are properly reset:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

#### 4. Async/Await Issues

Always use `await` for async operations:

```typescript
it('should work', async () => {
  const result = await service.doSomething();
  expect(result).toBeDefined();
});
```

### Debug Mode

```bash
# Run tests with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Or use VS Code debugger
# Add breakpoints and use "Debug Jest Test" configuration
```

## Test Coverage

### Generate Coverage Report

```bash
# All projects
npm test -- --coverage

# Specific project
nx test evaluation-service --coverage

# Coverage threshold is configured in jest.config.js
```

### View Coverage Report

After running with `--coverage`, open:

```
coverage/lcov-report/index.html
```

### Coverage Requirements

- **Unit tests**: Minimum 80% coverage for new code
- **Integration tests**: All critical paths covered
- **E2E tests**: All user workflows covered

## Best Practices

1. **Write Tests First**: Follow TDD when possible
2. **Test Behavior, Not Implementation**: Focus on what, not how
3. **Keep Tests Isolated**: Each test should be independent
4. **Use Descriptive Names**: Test names should describe what they test
5. **Mock External Dependencies**: Don't make real API calls in unit tests
6. **Clean Up**: Always clean up test data and mocks
7. **Run Tests Before Committing**: `npm run check && npm test && npm run build`

## Related Documentation

- **[docs/LOCAL_DEV.md](LOCAL_DEV.md)** - Local development guide
- **[docs/SANDBOX_TESTING.md](SANDBOX_TESTING.md)** - OpenSandbox testing guide
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** - Architecture overview
- **[.cursor/rules/core/tests.mdc](../.cursor/rules/core/tests.mdc)** - Testing rules and requirements
