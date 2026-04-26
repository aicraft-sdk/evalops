# Evalops — AI Governance Changes

Branch: `feat/agents-md-cli-migration`

This document describes every AI-governance-related change made to this repository as part of the E-series portfolio initiatives run from `ai_resources`.

---

## E1 — Agents-MD Linter: Switch to CLI (+ ESM Workaround Removed)

### Context: The ESM Problem
Evalops has `"type": "module"` in its `package.json`, which makes Node.js treat all `.js` files as ESM modules. The canonical `agents-md-lint.js` uses CommonJS (`require()`, `module.exports`). Running it as a `.js` file in an ESM package fails with:
```
SyntaxError: require is not defined in ES module scope
```
The previous workaround was to store the linter as `agents-md-lint.cjs` — Node.js always treats `.cjs` files as CommonJS regardless of `"type": "module"`. This worked but meant evalops was the only project with a `.cjs` extension, making the CI command inconsistent with all other projects.

**The CLI fix:** `npx @bcai/ai-resources-cli` runs in its own Node.js process with its own module scope — it is not affected by evalops's `"type": "module"` setting. The CLI invokes the linter internally as CommonJS. The ESM workaround is now completely unnecessary.

### `.github/workflows/agents-md-validate.yml` (new — replaces deleted `.cjs` approach)
**Previous approach (deleted):** `tools/scripts/agents-md-lint.cjs` + CI step `run: node tools/scripts/agents-md-lint.cjs`
**New approach:**
```yaml
- name: Run agents-md-lint
  run: npx @bcai/ai-resources-cli tools linter/agents-md-lint
```
**Why this is better:** No per-project extension workaround. The CLI handles ESM/CJS internally. All 8 project CI workflows now use the identical command.

### `tools/scripts/agents-md-lint.cjs` (deleted)
**Why:** No longer needed. The `.cjs` extension was the ESM workaround — now the CLI handles it. `tools/scripts/` directory was removed entirely.

### `AGENTS.md` (modified)
**Why:** The previous `AGENTS.md` was 15KB — nearly double the 8KB lint limit. It contained extensive implementation details (database schema notes, RLS policy excerpts, migration guides) that belong in the codebase or separate docs, not in the agent contract.
**What changed:** Rewritten to the three-tier format. Implementation details moved to the appropriate `docs/` files. The `AGENTS.md` now describes *what evalops is* (the org's SonarQube-equivalent for AI), *what it can do* (policy evaluation, eval harness, cost tracking, tenant management), and *what it must not do* (no cross-tenant data access, no bypassing RLS, no storing model outputs longer than the retention policy).

---

## E3 — Recall: Learning Extraction Mandate

### `.recall.json` (new)
**Why:** Evalops is the org's evaluation platform — it is responsible for measuring quality across all AI projects. Running recall on evalops captures learnings about how to build better evaluations, which benefits the entire portfolio.

**Special consideration:** Evalops processes tenant data (evaluation results, model outputs). The `.recall.json` privacy config is stricter than other projects: `exclude_patterns` covers any file in `src/` that might contain evaluation outputs, and the extractor is limited to `docs/`, `AGENTS.md`, and session summary files.

### `.github/workflows/compound-nightly.yml` (new)
**Why:** Nightly compounding. Evalops runs evaluations continuously against all registered projects; a daily extraction ensures that meta-learnings about the evaluation process itself are captured.

### `docs/learnings/shared/README.md` (new)
**Why:** Shared learnings landing page.

---

## E8 — IDP Backbone: Project Config

### `project-config.json` (new)
**Why:** Evalops participates in the `ai_resources` IDP. As the org's evaluation platform, it is a consumer of the core-foundation set (adversarial verification is directly applicable — evalops must verify its own evaluation results before reporting them).

**What it contains:**
```json
{
  "version": "1.0.0",
  "project": {
    "id": "evalops",
    "name": "Evalops"
  },
  "resources": {
    "sets": ["core-foundation"],
    "skills": [],
    "rules": [],
    "commands": [],
    "agents": [],
    "hooks": []
  }
}
```

---

## Notes

- **Self-evals gap (E5 deferred):** Evalops is the evaluation platform but has no self-evals. The E5 initiative established `ai_resources/evals/templates/baseline.eval.ts` as the starting point. Evalops should be the first project to adopt this template — dogfooding its own platform.
- **ESM gotcha:** Any future scripts added to evalops that use CommonJS must use the `.cjs` extension, or be run via a tool that manages its own module scope (like the CLI). Do not add `agents-md-lint.cjs` back — it was a workaround, not a pattern.
- **`tools/scripts/` directory:** Removed entirely.
- **ADR-004 connection:** `ai_resources/docs/decisions/ADR-004-evals-harness.md` positions evalops as the canonical org-wide eval platform. Evalops's L4/L5 mapping: `evaluation-service` = Layer 4 (evaluation), `analytics-service` = Layer 5 (unified posture).
