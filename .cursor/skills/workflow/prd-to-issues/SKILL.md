---
name: prd-to-issues
description: Break PRDs into independently-grabbable GitHub issues using vertical slices (tracer bullets). Use when user wants to break down a PRD into issues, create implementation tasks from PRD, or plan vertical slice implementation.
---

# PRD to Issues

Break a PRD into independently-grabbable GitHub issues using vertical slices (tracer bullets).

## Process

### Step 1: Locate the PRD

Ask the user for the PRD GitHub issue number (or URL). Fetch it with `gh issue view <number>`. Read and internalize the full PRD content (with all comments).

### Step 2: Explore the Codebase

Read the key modules and integration layers referenced in the PRD. Identify:

- The distinct integration layers the feature touches (e.g. DB/schema, API/backend, UI, tests, config)
- Existing patterns for similar features
- Natural seams where work can be parallelized

### Step 3: Draft Vertical Slices

Break the PRD into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

**Key principles**:

- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- The first slice should be the simplest possible end-to-end path (the "hello world" tracer bullet)
- Later slices add breadth: edge cases, additional user stories, polish

### Step 4: Quiz the User

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Layers touched**: which integration layers this slice cuts through
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories from the PRD this addresses

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Is the ordering right for the first tracer bullet?
- Are there any slices missing?

Iterate until the user approves the breakdown.

### Step 5: Create the GitHub Issues

For each approved slice, create a GitHub issue using `gh issue create`. Use the issue body template below.

Create issues in dependency order (blockers first) so you can reference real issue numbers in the "Blocked by" field.

## Issue Template

```markdown
## Parent PRD

#<PRD_ISSUE_NUMBER>

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation. Reference specific sections of the parent PRD rather than duplicating content.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- Blocked by #<ISSUE_NUMBER> (if any)

Or "None - can start immediately" if no blockers.

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7
```

After creating all issues, print a summary table:

```
| # | Title | Blocked by | Status |
|---|-------|-----------|--------|
| 42 | Basic widget creation | None | Ready |
| 43 | Widget listing | #42 | Blocked |
```

**Do NOT close or modify the parent PRD issue.**

## Vertical Slicing Principles

**Vertical slices** cut through all layers end-to-end:
- Database/schema changes
- API/backend implementation
- UI/frontend changes
- Tests for the complete flow

**Horizontal slices** (anti-pattern) work on one layer at a time:
- All database changes first
- Then all API changes
- Then all UI changes

**Why vertical slicing**:
- Each slice is independently demoable
- Early feedback on complete functionality
- Easier to test end-to-end
- Natural dependency management
- Prevents integration surprises

## Best Practices

- **Start simple**: First slice should be the simplest possible end-to-end path
- **Complete paths**: Each slice should be a complete user journey
- **Testable**: Each slice should be independently testable
- **Dependencies**: Clearly identify which slices block others
- **Reference PRD**: Link back to parent PRD rather than duplicating content

## Integration

- Use with `write-prd` skill to create the parent PRD
- Use with `writing-plans` skill for detailed implementation planning of each issue
- Use with `test-driven-development` skill for each vertical slice
