---
name: populate-templates
description: Populate empty session, pattern, and pre-compact-state templates with actual content from the conversation
argument_hint: "sessions|patterns|pre-compact|all"
allowed_tools: ["Read", "Write", "Shell", "grep"]
---

# Populate Templates

Populates empty template files created by hooks with actual content from the conversation.

## Usage

### Populate Session Summaries

`/populate-templates sessions`

Finds all empty session summary templates in `.cursor/sessions/` and populates them with content based on the conversation history.

### Populate Pattern Files

`/populate-templates patterns`

Finds all empty pattern templates in `.cursor/skills/workflow/continuous-learning/learned-patterns/` and populates them with discovered patterns from the conversation.

### Populate Pre-Compact State

`/populate-templates pre-compact`

Finds the `pre-compact-state.md` template in `.cursor/sessions/` and populates it with current progress, decisions, approaches, and context that should be preserved through compaction.

### Populate All

`/populate-templates all`

Populates session summaries, pattern files, and pre-compact-state templates.

## How It Works

When hooks create template files, they contain placeholders like `[Add approaches that worked with evidence]`. This command:

1. Finds template files with placeholder content
2. Analyzes the conversation history
3. Populates the templates with actual content:
   - **Session summaries**: What worked, what didn't, what's left to do, key decisions, context
   - **Pattern files**: Discovered patterns, when to use them, evidence, examples
   - **Pre-compact-state**: Current progress, key decisions, approaches that worked/failed, next steps, important context

## Template Detection

A file is considered a template if it contains placeholder text like:

- `[Add approaches that worked with evidence]`
- `[Describe the pattern that was discovered]`
- `[Add important decisions made during this session]`
- `[Add current progress summary]`
- `[Add important decisions that should be preserved]`
- `[Add what needs to be done next]`
- `[Add any context that must be preserved through compaction]`

## Best Practices

1. **Run after sessions**: Use this command at the end of a session to populate templates
2. **Review before committing**: Always review populated content before committing
3. **Manual refinement**: You can manually edit populated files if needed
4. **Regular cleanup**: Periodically populate templates to keep them up to date

## Integration

- Session management hooks (`.cursor/hooks.json`)
- Continuous learning skill (`skills/workflow/continuous-learning/`)
- Memory persistence patterns (`docs/optimization-patterns/memory-persistence.md`)
