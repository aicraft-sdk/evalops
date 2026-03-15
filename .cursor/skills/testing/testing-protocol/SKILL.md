---
name: testing-protocol
description: Comprehensive testing requirements and patterns including unit tests, integration tests, E2E tests, test structure, mocking patterns, and coverage expectations. Use when writing unit tests, writing integration tests, writing E2E tests, reviewing test coverage, setting up test infrastructure, or validating test quality.
---

# Testing Protocol

## Overview

This workspace requires comprehensive testing for all code changes. Every feature must include unit tests, integration tests, and proper error handling validation. Tests must pass before code is considered complete.

**Related Rules**:

- [tests.mdc](.cursor/rules/core/tests.mdc) - Comprehensive testing protocol
- [general.mdc](.cursor/rules/core/general.mdc) - Testing requirements

## Mandatory Test Coverage

For every new feature or change, you MUST:

- **Write unit tests** for all new functions, classes, and modules
- **Write integration tests** for new API endpoints, gRPC services, or external service interactions
- **Write error handling tests** for all error scenarios and edge cases
- **Write validation tests** for input validation and schema compliance
- **Write security tests** for data redaction, authentication, and authorization

## Test Categories

### Unit Tests (`**/*.spec.ts`)

Test individual functions and methods in isolation:

- Mock external dependencies using `@golevelup/ts-jest` and `createMock`
- Test all code paths and branches
- Validate input/output behavior
- Test error conditions and exceptions
- Use proper TypeScript typing with `TestingModule`

### Integration Tests (`test/integration/*.e2e.ts`)

Test component interactions and external integrations:

- Test API endpoints and gRPC services
- Test external service integrations (Redis, PostgreSQL, SQL Server)
- Test end-to-end workflows
- Test configuration loading and validation
- Use `supertest` for HTTP testing
- Use `nock` for external API mocking

### Security Tests

Test security-related functionality:

- Test data redaction patterns
- Test authentication and authorization
- Test input sanitization
- Test sensitive data handling
- Test JWT token validation

## Test Structure Standards

All tests must follow this structure:

```typescript
import { Test } from "@nestjs/testing";
import { createMock } from "@golevelup/ts-jest";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "@jest/globals";

describe("FeatureName", () => {
  let service: FeatureService;
  let module: TestingModule;

  beforeAll(async () => {
    // Global setup
  });

  afterAll(async () => {
    // Global cleanup
    jest.clearAllMocks();
  });

  beforeEach(async () => {
    // Test-specific setup
  });

  afterEach(() => {
    // Test-specific cleanup
  });

  describe("Happy Path", () => {
    it("should handle valid input correctly", () => {
      // Test implementation
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid input gracefully", () => {
      // Error test implementation
    });
  });

  describe("Edge Cases", () => {
    it("should handle boundary conditions", () => {
      // Edge case test implementation
    });
  });
});
```

## Test Execution Protocol

### Step 1: Write Tests

1. Create test files following naming conventions:
   - `*.spec.ts` for unit tests
   - `*.e2e.ts` for integration tests
2. Write comprehensive test cases covering:
   - Happy path scenarios
   - Error conditions
   - Edge cases
   - Boundary conditions
   - Security scenarios

### Step 2: Run Tests

Execute tests using Nx commands:

```bash
# Run unit tests for specific project
nx test <project-name>

# Run integration tests
nx test <project-name> --config=jest.config.e2e.ts

# Run all tests with coverage
nx test <project-name> --coverage

# Run tests for all affected projects
nx affected:test
```

### Step 3: Retry Logic (Maximum 3 Attempts)

If tests fail:

1. **Attempt 1**: Fix obvious issues (syntax errors, import problems, basic logic errors)
2. **Attempt 2**: Debug and fix test logic, mock setup, or assertion issues
3. **Attempt 3**: Comprehensive debugging and refactoring

### Step 4: Failure Report

If tests still fail after 3 attempts, provide a detailed failure report with:

- Feature/change description
- Test files created
- Test execution results
- Failure analysis
- Debugging attempts
- Recommendations

## Test Quality Standards

### Test Completeness

- All public methods must have tests
- All error paths must be tested
- All edge cases must be covered
- All configuration options must be tested

### Test Reliability

- Tests must be deterministic (no flaky tests)
- Tests must be independent (can run in any order)
- Tests must clean up after themselves
- Tests must use proper mocking for external dependencies

### Test Maintainability

- Tests must be readable and well-documented
- Tests must use descriptive names
- Tests must follow the AAA pattern (Arrange, Act, Assert)
- Tests must be organized logically

## Mocking Patterns

For detailed mocking patterns and test examples, see [test-patterns.md](references/test-patterns.md).

## Test Coverage Expectations

- Aim for 80%+ code coverage
- Test all code paths and branches
- Test error handling and exception scenarios
- Test input validation and edge cases

## Best Practices

- Don't use `.only` in test files (pre-commit hook prevents this)
- Use constants for repeated strings to avoid lint issues
- Clear mocks between tests using `beforeEach` or `afterEach`
- Use descriptive test names that explain what is being tested
- Group related tests using `describe` blocks
- Test error paths as thoroughly as success paths

## References

- **Test Writing Guide**: `skills/test-writing/SKILL.md` - Practical examples and patterns
- **Testing Rules**: `.cursor/rules/core/tests.mdc`
- **Example Unit Tests**: `platform/entity-service/src/modules/**/*.spec.ts`
- **Example E2E Tests**: `platform/entity-service/test/integration/*.e2e.ts`
- **Testing Shared Library**: `libs/testing-shared/`
