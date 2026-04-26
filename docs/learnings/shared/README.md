# Shared Learnings

Team-verified knowledge extracted by [@bcai/recall](https://github.com/biocatch/agents-compounder) from sessions and git history.

## Tiers

| Tier | Path | Committed? | Description |
|------|------|-----------|-------------|
| Personal | `docs/learnings/personal/` | No (gitignored) | Local scratchpad; auto-filled after sessions |
| Shared | `docs/learnings/shared/` | Yes | Team-confirmed learnings (≥2 confirmations) |

## Adding learnings

```sh
# Extract from recent git history:
recall compound --source git --tier shared

# Promote personal → shared (interactive):
recall promote
```

Nightly CI extracts learnings automatically (`compound-nightly.yml`).

## First-time setup

```sh
# Wire IDE stop hooks so recall runs automatically after sessions:
npx -y -p @bcai/recall recall setup
```

Config is in `.recall.json` at the repo root.
