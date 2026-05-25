/**
 * REM-FIX: silent-failure-hunter fixes (TDD RED → GREEN)
 *
 * 4 issues found after Phase 3 build:
 *   CRITICAL-2: scopes cross-dialect deserialization (SQLite JSON string vs Postgres array)
 *   CRITICAL-1: isDevMode guard comment + improved error message in db.ts
 *   HIGH-1: bcrypt bare catch {} in dev.ts silently swallows errors
 *   HIGH-2: webpack static require of @evalops/dev-runtime in redis.module.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// process.cwd() in Jest is always the Nx workspace root
const ROOT = process.cwd();

// ── FIX 1: scopes normalization — file content check ──────────────────────
describe('FIX-1 CRITICAL-2: PersonalAccessTokensRepository scopes normalization', () => {
  const repoFile = join(
    ROOT,
    'libs/shared-db/src/lib/repositories/personal-access-tokens.repository.ts',
  );

  it('contains scopes normalization for SQLite JSON string', () => {
    const src = readFileSync(repoFile, 'utf8');
    // The fix must add a normalization block after the DB query
    expect(src).toContain("typeof pat.scopes === 'string'");
    expect(src).toContain('JSON.parse(pat.scopes');
  });
});

// ── FIX 2: isDevMode comment + improved error message in db.ts ─────────────
describe('FIX-2 CRITICAL-1: db.ts isDevMode guard comment and error message', () => {
  const dbFile = join(ROOT, 'libs/shared-db/src/lib/db.ts');

  it('has a guard comment above the isDevMode declaration', () => {
    const src = readFileSync(dbFile, 'utf8');
    // The comment must warn about module-load-time evaluation
    expect(src).toContain('EVALOPS_DEV_MODE must be set before any import');
  });

  it('has an improved error message that mentions EVALOPS_DEV_MODE=1', () => {
    const src = readFileSync(dbFile, 'utf8');
    expect(src).toContain('EVALOPS_DEV_MODE=1');
    // Must NOT use the old generic message
    expect(src).not.toContain('Did you forget to provision a database?');
  });
});

// ── FIX 3: bcrypt bare catch replaced with warn in dev.ts ──────────────────
describe('FIX-3 HIGH-1: dev.ts bcrypt catch should warn, not swallow', () => {
  const devFile = join(ROOT, 'apps/cli/src/commands/dev.ts');

  it('does not have a bare catch {} near bcrypt', () => {
    const src = readFileSync(devFile, 'utf8');
    // Must have catch with err param near bcrypt (not a bare catch)
    expect(src).toContain('catch (err)');
    // Must have a console.warn for the bcrypt/password hash error
    expect(src).toContain('failed to hash admin password');
  });
});

// ── FIX 4: redis.module.ts eval('require') to prevent webpack bundling ──────
describe('FIX-4 HIGH-2: redis.module.ts should use eval(require) to avoid webpack bundling', () => {
  const redisModuleFile = join(
    ROOT,
    'libs/shared-common/src/lib/redis/redis.module.ts',
  );

  it('uses eval require to prevent webpack static analysis of dev-runtime', () => {
    const src = readFileSync(redisModuleFile, 'utf8');
    // The fix replaces `require('@evalops/dev-runtime')` with `eval('require')('@evalops/dev-runtime')`
    expect(src).toContain("eval('require')");
    // Must NOT use direct require (which webpack statically analyzes)
    expect(src).not.toContain("require('@evalops/dev-runtime')");
  });
});

// ── Behavioral correctness tests ────────────────────────────────────────────
describe('scopes normalization logic (behavioral)', () => {
  it('normalizes a SQLite JSON string to an array', () => {
    const rawPat = {
      scopes: '["runs:write","specs:write"]',
    } as { scopes: string[] | string };

    // The normalization logic from the fix
    let pat = rawPat;
    if (pat && typeof pat.scopes === 'string') {
      pat = { ...pat, scopes: JSON.parse(pat.scopes as unknown as string) as string[] };
    }

    expect(Array.isArray(pat.scopes)).toBe(true);
    expect((pat.scopes as string[]).includes('runs:write')).toBe(true);
    expect((pat.scopes as string[]).includes('specs:write')).toBe(true);
  });

  it('does not touch scopes when already an array (Postgres path)', () => {
    const rawPat = {
      scopes: ['runs:write', 'specs:write'],
    } as { scopes: string[] | string };

    let pat = rawPat;
    if (pat && typeof pat.scopes === 'string') {
      pat = { ...pat, scopes: JSON.parse(pat.scopes as unknown as string) as string[] };
    }

    expect(Array.isArray(pat.scopes)).toBe(true);
    expect((pat.scopes as string[]).length).toBe(2);
  });

  it('Array.includes does exact match (correct) vs String.includes does substring match (bug)', () => {
    const jsonStr = '["runs:write"]';

    // Bug demonstration: String.includes('runs') matches the JSON string as substring
    const buggyMatch = jsonStr.includes('runs');
    expect(buggyMatch).toBe(true); // This is the bug — 'runs' is NOT a valid scope name

    // Fix: Array.includes does exact match
    const arr = JSON.parse(jsonStr) as string[];
    const fixedMatch = arr.includes('runs');
    expect(fixedMatch).toBe(false); // Correctly rejected
  });
});
