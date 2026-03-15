---
name: manage-parallel
description: Manage parallel Cursor instances and worktrees using cascade method and two-instance kickoff patterns
argument_hint: "[cascade|kickoff|list]"
allowed_tools: ["Read", "Write", "Shell"]
---

# Manage Parallel Instances

Manage parallel Cursor instances and worktrees using proven patterns from the longform guide.

## Usage

### Cascade Method

`/manage-parallel cascade`

Organize multiple Cursor instances using the cascade pattern:
- Open new tasks in new tabs to the right
- Sweep left to right, oldest to newest
- Focus on at most 3-4 tasks at a time

**Example Setup**:
```
Tab 1 (Left): Feature A - Main implementation
Tab 2 (Middle): Feature B - Research and planning
Tab 3 (Right): Feature C - Code review
```

### Two-Instance Kickoff

`/manage-parallel kickoff`

Set up two-instance kickoff pattern for new projects:

**Instance 1: Scaffolding Agent**
- Lays down the scaffold and groundwork
- Creates project structure
- Sets up configs (CLAUDE.md, rules, agents)
- Worktree: `scaffold` or `setup`

**Instance 2: Deep Research Agent**
- Connects to all your services, web search
- Creates the detailed PRD
- Creates architecture mermaid diagrams
- Compiles the references with actual documentation clips
- Worktree: `research` or `design`

### List Parallel Instances

`/manage-parallel list`

List all active worktrees and their purposes. Also shows session tracking status from `.cursor/sessions.json`.

## Cascade Method Details

### Organization

- **Left to Right**: Oldest to newest tasks
- **Focus Limit**: Maximum 3-4 tasks at a time
- **Clear Naming**: Use `/rename` to name all chats
- **Sweep Pattern**: Process left to right systematically

### Best Practices

1. **Define Scope**: Each instance has clear, non-overlapping scope
2. **Minimal Overlap**: Avoid code changes that overlap
3. **Use Worktrees**: Essential for parallel instances
4. **Name Conversations**: Use `/rename` for clarity
5. **Focus**: Don't spread too thin - 3-4 tasks max

## Two-Instance Kickoff Details

### Setup Process

1. **Create Worktrees**: Set up `scaffold` and `research` worktrees
2. **Instance 1**: Set up project structure in `scaffold` worktree
3. **Instance 2**: Research and design in `research` worktree
4. **Merge Results**: Combine results when both complete

### Benefits

- Parallel setup and research
- Faster project initialization
- Clear separation of concerns
- Efficient use of time

## Parallel Instance Management

### Key Principles

- **Well-Defined Scope**: Each instance knows exactly what it's working on
- **Minimal Overlap**: Avoid overlapping code changes
- **Use Worktrees**: Isolated workspaces prevent conflicts
- **Name Everything**: Use `/rename` for clarity
- **Monitor Overlap**: Watch for overlapping changes

### When to Scale

- Only add instances when truly necessary
- Goal: Maximum productivity with minimum parallelization
- Don't set arbitrary terminal amounts

### Red Flags

**Never**:
- Run parallel instances without worktrees
- Overlap code changes between instances
- Spread too thin (more than 3-4 tasks)
- Skip naming conversations

**Always**:
- Use worktrees for parallel instances
- Define clear scope for each instance
- Name conversations with `/rename`
- Monitor for overlapping changes

## Session Tracking

When creating worktrees, sessions are automatically tracked in `.cursor/sessions.json`:

- **Automatic Registration**: Worktrees are registered when created
- **Status Tracking**: Track status (implementing, reviewing, planning, complete, blocked)
- **Overlap Detection**: Use `/session-coordinate overlaps` to check for conflicts
- **Status Checking**: Use `/session-status` to see all active sessions

## Integration

- Git worktrees skill (`skills/workflow/using-git-worktrees/`)
- Subagent orchestration (`skills/workflow/subagent-orchestration/`)
- Session management (`commands/workflow/session-management.md`)
- Parallel sessions skill (`skills/workflow/parallel-sessions/`)
- Session status command (`commands/workflow/session-status.md`)
- Session coordinate command (`commands/workflow/session-coordinate.md`)
