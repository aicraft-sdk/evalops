---
name: git-guardrails
description: Set up Cursor hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prevent destructive git operations, add git safety hooks, or block git push/reset in Cursor.
---

# Setup Git Guardrails

Sets up a `preToolUse` hook that intercepts and blocks dangerous git commands before Claude executes them.

## What Gets Blocked

- `git push` (all variants including `--force`)
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

When blocked, Claude sees a message telling it that it does not have authority to access these commands.

## Steps

### 1. Ask scope

Ask the user: install for **this project only** (`.cursor/hooks.json`) or **all projects** (`~/.cursor/hooks.json`)?

### 2. Copy the hook script

The bundled script is at: [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh)

Copy it to the target location based on scope:

- **Project**: `.cursor/hooks/block-dangerous-git.sh`
- **Global**: `~/.cursor/hooks/block-dangerous-git.sh`

Make it executable with `chmod +x`.

### 3. Add hook to hooks.json

Add to the appropriate hooks file:

**Project** (`.cursor/hooks.json`):

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "matcher": "tool == 'Bash' && tool_input.command matches 'git (push|reset|clean|branch|checkout|restore)'",
        "command": "bash .cursor/hooks/block-dangerous-git.sh",
        "description": "Block dangerous git commands"
      }
    ]
  }
}
```

**Global** (`~/.cursor/hooks.json`):

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "matcher": "tool == 'Bash' && tool_input.command matches 'git (push|reset|clean|branch|checkout|restore)'",
        "command": "bash ~/.cursor/hooks/block-dangerous-git.sh",
        "description": "Block dangerous git commands"
      }
    ]
  }
}
```

If the hooks file already exists, merge the hook into existing `hooks.preToolUse` array — don't overwrite other hooks.

### 4. Ask about customization

Ask if user wants to add or remove any patterns from the blocked list. Edit the copied script accordingly.

### 5. Verify

Run a quick test:

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | bash .cursor/hooks/block-dangerous-git.sh
```

Should exit with code 2 and print a BLOCKED message to stderr.

## Hook Format Notes

Cursor uses camelCase hook names (`preToolUse` not `PreToolUse`). The hook format differs from Claude Code:

- Hook names: `preToolUse`, `postToolUse`, `stop`, `sessionStart`, etc.
- Matcher syntax: Uses JavaScript-like expressions
- Command: Can be any executable command

## Customization

To customize blocked patterns, edit the `DANGEROUS_PATTERNS` array in the script:

```bash
DANGEROUS_PATTERNS=(
 "git push"
 "git reset --hard"
 # Add your custom patterns here
)
```

## Troubleshooting

**Hook not blocking**: 
- Verify hook script is executable (`chmod +x`)
- Check hooks.json syntax is valid JSON
- Ensure matcher pattern matches your git command format

**False positives**:
- Adjust matcher pattern to be more specific
- Modify script patterns to exclude safe commands
