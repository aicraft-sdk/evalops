---
name: write-prd
description: Create Product Requirements Documents (PRDs) with structured interview process, deep module extraction, and GitHub issue templates. Use when user wants to create a PRD, write product requirements, plan features, or specify requirements for development.
---

# Write a PRD

This skill guides you through creating a comprehensive Product Requirements Document (PRD) using a structured interview process.

## Process

This skill will be invoked when the user wants to create a PRD. You should go through the steps below. You may skip steps if you don't consider them necessary.

### Step 1: Gather Problem Description

Ask the user for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

### Step 2: Explore the Codebase

Explore the repo to verify their assertions and understand the current state of the codebase. Identify:

- Existing patterns for similar features
- Current architecture and module structure
- Integration points and dependencies
- Constraints and technical limitations

### Step 3: Interview the User

Interview the user relentlessly about every aspect of this plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

Key areas to explore:

- User needs and pain points
- Success criteria and metrics
- Edge cases and error scenarios
- Integration requirements
- Performance and scalability needs
- Security and compliance considerations

### Step 4: Identify Modules

Sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A **deep module** (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these modules match their expectations. Check with the user which modules they want tests written for.

### Step 5: Write the PRD

Once you have a complete understanding of the problem and solution, use the template below to write the PRD. The PRD should be submitted as a GitHub issue.

## PRD Template

```markdown
## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As a [user type], I want [capability], so that [benefit]

Example:
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

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

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.
```

## Best Practices

- **Be thorough**: Don't skip the interview process - it's critical for shared understanding
- **Focus on behavior**: User stories should describe what users can do, not how it's implemented
- **Keep it current**: Avoid file paths and code snippets that will become outdated
- **Test planning**: Include testing decisions upfront, not as an afterthought
- **Scope clarity**: Clearly define what's out of scope to prevent scope creep

## Integration

- Use with `prd-to-issues` skill to break PRDs into implementable GitHub issues
- Use with `writing-plans` skill for detailed implementation planning after PRD approval
- Use with `brainstorming` skill for initial requirements gathering if needed
