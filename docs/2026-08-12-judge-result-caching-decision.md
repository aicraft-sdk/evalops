# Judge Result Caching (Infrastructure)

## What Changed

Added a `judge_cache` Postgres table and migration (`libs/shared-db/migrations/0006_add_judge_cache.sql`,
`libs/shared-db/src/lib/schema/judge-cache.ts`): one row per unique combination of evaluator,
organization, sample, output, prompt/config, model, and seed, with a unique index on `cache_key`
and RLS scoped by `organization_id`. `JudgeCacheRepository`
(`libs/shared-db/src/lib/repositories/judge-cache.repository.ts`) provides `findByCacheKey` /
`create`. `computeJudgeCacheKey`
(`apps/evaluation-service/src/app/evaluation/evaluators/judge-cache-key.ts`) derives a
deterministic `cache_key` by sha256-hashing a canonical JSON envelope (version, evaluator, org,
sample identity, output hash, expected hash with an explicit "absent" sentinel, contexts hash,
prompt fingerprint, model, temperature, maxTokens, seed). `JudgeCacheService`
(`apps/evaluation-service/src/app/evaluation/evaluators/judge-cache.service.ts`) wraps a
compute function in a cache-aside `getOrCompute`: look up by cache key, return the cached
score/reasoning on a hit, otherwise call the supplied compute function and best-effort write the
result. A shared `isUniqueConstraintViolation(error)` helper was added to
`libs/shared-db/src/lib/dialect-utils.ts` to distinguish an expected concurrent-write race
(Postgres `23505` / better-sqlite3 `SQLITE_CONSTRAINT_UNIQUE`) from a genuine cache-write failure.

This is Phase 2 of the judge-caching-and-calibration plan (commits `851f7b0`, `6d10eaf`,
`ceb8fa0`, `7d5e251`, `41b63f3`). `JudgeCacheService` is registered in `EvaluatorsModule` but is
**not yet called by any judge method** — no evaluator currently reads or writes through this
cache, so there is no behavior change for existing evaluation runs. Wiring it into the LLM-judge
methods is deferred to a later phase.

**Phase 3 update:** the wiring described above as deferred has landed — see
`docs/2026-08-12-judge-cache-wiring-and-model-resolution-decision.md` for the wiring itself,
`organizationId` threading, the deterministic fallback seed, and an accompanying model-resolution
behavior change. The "Impact" section below (written for Phase 2) is superseded by that doc.

## Why

LLM-judge scoring is the most expensive part of an evaluation run (a live model call per
sample per judge), and identical `(evaluator, sample, output, prompt, model, seed)` inputs
recur across repeated runs (e.g. re-running a policy check, or a golden-set calibration pass
introduced in a later phase). Caching the judge's score/reasoning by a deterministic key lets
later phases skip redundant model calls for inputs already scored, without changing the judge's
observable behavior.

## Alternatives Considered

- **Wire caching directly into each judge method in this phase:** Rejected for this phase.
  Landing the storage layer, key derivation, and fail-open service independently — before any
  evaluator depends on it — keeps this change reviewable in isolation and lets the schema/cache-key
  shape be validated before 11 call sites are migrated to depend on it.
- **Fail closed on cache errors (propagate lookup/write failures to the caller):** Rejected.
  A cache is an optimization, not a correctness dependency; `JudgeCacheService.getOrCompute`
  always falls through to `computeFn()` on a lookup error and always returns the live result on
  a write error, so a broken cache (RLS misconfiguration, DB outage) degrades to "no caching"
  rather than failing evaluation runs.
- **Use `Number()` or a broad try/catch to detect duplicate-key races on write:** Rejected in
  favor of an explicit `isUniqueConstraintViolation` code check. This distinguishes the expected,
  benign case (another concurrent request already wrote the same key — logged at `debug`) from a
  genuine infra failure (logged at `error`), and is checked unconditionally against both driver
  codes rather than branching on a dev-mode flag, so it stays correct even if dev-mode detection
  is stale.
- **Hash `expected ?? ''` directly for the cache key:** Rejected. That would make "no expected
  value supplied" and "expected explicitly supplied as an empty string" hash identically,
  silently colliding two semantically different cache-key inputs. An explicit
  `ABSENT_EXPECTED_SENTINEL` distinguishes the two.

## Impact

- **Evaluators / evaluation runs:** None yet — no judge method calls `JudgeCacheService`, so
  scoring behavior, latency, and cost are unchanged until a later phase wires it in.
- **Database:** New `judge_cache` table via migration `0006_add_judge_cache.sql`, with RLS
  enabled and a tenant-isolation policy matching the pattern used by other tenant-scoped tables.
- **Ongoing maintenance:** `CACHE_KEY_VERSION` in `judge-cache-key.ts` must be bumped whenever the
  key-derivation logic changes, to force a clean cache generation rather than silently reusing
  stale entries under a colliding key shape. Any future consumer of `isUniqueConstraintViolation`
  should keep both the Postgres and better-sqlite3 codes in sync if a new driver is added.
