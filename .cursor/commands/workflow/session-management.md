---
name: session-management
description: Manage Cursor session state - save, load, and list session summaries
argument_hint: "save|load|list|populate [session-name]"
allowed_tools: ["Read", "Write", "Shell"]
---

# Session Management

Manage Cursor session state for memory persistence across sessions.

## Usage

### Save Current Session

`/session-management save`

Creates a session summary file with:

- What worked (with evidence)
- What didn't work
- What's left to do
- Key decisions made
- Context for next session

### Populate Session Summary

`/session-management populate [session-name]`

Populates an existing session summary template with actual content from the conversation. If no session name is provided, populates the most recent empty template.

**Note**: This command should be used by Claude to fill in template files created by hooks. Claude will analyze the conversation history and populate the template with:

- What approaches worked (with evidence from the conversation)
- What approaches were attempted but failed
- What's left to do
- Key decisions made during the session
- Context for the next session
- Files that were modified

Example:

- `/session-management populate session-2026-02-09-22-59-44.md`
- `/session-management populate` (populates most recent empty template)

### Load Previous Session

`/session-management load [session-name]`

Loads a previous session summary. If no session name is provided, loads the most recent session.

Example:

- `/session-management load session-2026-02-06-143022.md`
- `/session-management load` (loads most recent)

### List Sessions

`/session-management list`

Lists all available session summaries, sorted by most recent first.

## Session Storage Format

Sessions are stored in `.cursor/sessions/` directory with filenames:

- `session-YYYY-MM-DD-HHMMSS.md`

Each session file contains:

- **What Worked**: Approaches that succeeded with evidence
- **What Didn't Work**: Approaches that were attempted but failed
- **What's Left To Do**: Remaining tasks and approaches
- **Key Decisions**: Important decisions made during the session
- **Context for Next Session**: Context helpful for continuing work
- **Files Modified**: Key files that were modified

## Automatic Session Management

The following hooks run automatically:

- **sessionStart**: Loads the most recent session when a new session starts
- **sessionEnd**: Saves session summary when session ends
- **preCompact**: Saves state before context compaction
- **stop**: Extracts patterns for continuous learning

## Template Population

**Important**: Hooks create template files with placeholders. To populate them with actual content:

1. Use `/populate-templates sessions` to fill session summaries
2. Use `/populate-templates patterns` to fill pattern files
3. Or use `/populate-templates all` to fill both

The `populate` subcommand in this command can also be used to populate a specific session file.

## Best Practices

1. **Save frequently**: Use `/session-management save` before switching contexts
2. **Populate templates**: Use `/populate-templates` to fill empty templates created by hooks
3. **Review before loading**: Check session summaries before loading to ensure relevance
4. **Keep summaries focused**: Include only what's necessary for continuation
5. **Update summaries**: Manually update session files if needed for clarity

## Integration

- Memory persistence hooks (`.cursor/hooks.json`)
- Continuous learning skill (`skills/workflow/continuous-learning/`)
- Token optimization patterns (`rules/performance/token-optimization.mdc`)
