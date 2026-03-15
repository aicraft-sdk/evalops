---
name: request-refactor-plan
description: Create structured refactor plans with tiny commits, test coverage assessment, and GitHub issue templates. Use when user wants to create a refactor plan, plan refactoring work, or break down refactoring tasks.
---

# Request Refactor Plan

This skill will be invoked when the user wants to create a refactor request. You should go through the steps below. You may skip steps if you don't consider them necessary.

## Process

### Step 1: Gather Problem Description

Ask the user for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

### Step 2: Explore the Codebase

Explore the repo to verify their assertions and understand the current state of the codebase. Identify:

- Current code structure and organization
- Areas that need refactoring
- Dependencies and coupling points
- Test coverage in the affected areas

### Step 3: Consider Alternatives

Ask whether they have considered other options, and present other options to them. Explore:

- Different refactoring approaches
- Alternative architectural patterns
- Incremental vs big-bang refactoring
- Trade-offs of each approach

### Step 4: Interview the User

Interview the user about the implementation. Be extremely detailed and thorough. Explore:

- Why this refactoring is needed
- What problems it solves
- What risks exist
- How to mitigate those risks
- Success criteria

### Step 5: Define Scope

Hammer out the exact scope of the implementation. Work out what you plan to change and what you plan not to change. Be specific about:

- Files/modules that will be modified
- Files/modules that will remain unchanged
- Boundaries and interfaces
- Breaking changes vs non-breaking changes

### Step 6: Assess Test Coverage

Look in the codebase to check for test coverage of this area of the codebase. If there is insufficient test coverage, ask the user what their plans for testing are.

**Critical**: Refactoring without tests is dangerous. Ensure adequate test coverage before proceeding.

### Step 7: Break into Tiny Commits

Break the implementation into a plan of tiny commits. Remember Martin Fowler's advice to "make each refactoring step as small as possible, so that you can always see the program working."

Each commit should:

- Leave the codebase in a working state
- Be independently reviewable
- Be reversible if needed
- Make one logical change

### Step 8: Create GitHub Issue

Create a GitHub issue with the refactor plan. Use the following template for the issue description:

## Refactor Plan Template

```markdown
## Problem Statement

The problem that the developer is facing, from the developer's perspective.

## Solution

The solution to the problem, from the developer's perspective.

## Commits

A LONG, detailed implementation plan. Write the plan in plain English, breaking down the implementation into the tiniest commits possible. Each commit should leave the codebase in a working state.

Example format:
1. Extract `validateEmail` function to `utils/validation.ts`
2. Update all call sites to use extracted function
3. Add unit tests for `validateEmail` function
4. Remove duplicate validation logic from `user.service.ts`
...

## Decision Document

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

**DO NOT include specific file paths or code snippets.** They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)
- Test coverage requirements

## Out of Scope

A description of the things that are out of scope for this refactor.

## Further Notes (optional)

Any further notes about the refactor.
```

## Best Practices

- **Tiny commits**: Each commit should be independently reviewable and leave code in working state
- **Test first**: Ensure adequate test coverage before refactoring
- **Incremental**: Make small, safe changes rather than big rewrites
- **Reversible**: Each step should be reversible if problems arise
- **Clear scope**: Explicitly define what's in and out of scope

## Integration

- Use with `writing-plans` skill for detailed implementation planning
- Use with `test-driven-development` skill to ensure tests are written first
- Use with `requesting-code-review` skill for review checkpoints
