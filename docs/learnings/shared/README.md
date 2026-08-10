# Shared Learnings

Team-verified knowledge captured from sessions and git history.

> Automated extraction previously ran via the internal `@bcai/recall` tool and a
> nightly `compound-nightly.yml` workflow. Both were removed because they
> depended on an internal package registry not available outside Biocatch.
> Learnings are now added manually — see below.

## Tiers

| Tier | Path | Committed? | Description |
|------|------|-----------|-------------|
| Personal | `docs/learnings/personal/` | No (gitignored) | Local scratchpad for notes you haven't confirmed as team-wide yet |
| Shared | `docs/learnings/shared/` | Yes | Team-confirmed, reusable learnings |

## Adding learnings

Add a dated Markdown file under `docs/learnings/shared/` (e.g.
`docs/learnings/shared/2026-08-eval-flakiness.md`) describing the finding, why
it matters, and any follow-up. Open it in the same PR as the change it relates
to, or as a standalone doc PR. See `AGENTS.md` under "Agent Operating Rules"
for when to add an entry.
