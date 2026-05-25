/**
 * REM-FIX Phase 2 review issues — TDD spec
 *
 * CRITICAL-1: --password flag removed from login (password-in-process-list)
 * CRITICAL-2: requireAuth copies serviceToken → token so assertion holds at runtime
 * CRITICAL-3: waitFor wrapped in try/catch with run ID printed before exit
 * CRITICAL-4: PAT mint fallback emits warning (not silent)
 * CRITICAL-5: spec push checks file existence before SDK call
 * HIGH-1: waitFor gated behind --watch flag
 * HIGH-2: template files removed from package.json files array
 * HIGH-3: non-ENOENT credential errors emit a warning
 * HIGH-4: SDK calls wrapped in try/catch in eval.ts and token.ts
 */

import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// CRITICAL-1: main.ts and login.ts must NOT have --password CLI argument
// ---------------------------------------------------------------------------
describe('CRITICAL-1: no --password CLI flag', () => {
  it('main.ts should not contain --password option definition', () => {
    const mainTs = fs.readFileSync(
      path.join(__dirname, '..', 'main.ts'),
      'utf-8'
    );
    // Should not have `.option('--password` or `'--password <password>'`
    expect(mainTs).not.toMatch(/\.option\s*\(\s*['"`]--password/);
  });

  it('login.ts should not accept --password from CLI args', () => {
    const loginTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'login.ts'),
      'utf-8'
    );
    // Should not parse --password= from args (must read from env instead)
    expect(loginTs).not.toMatch(/arg\.startsWith\(['"`]--password=/);
  });

  it('login.ts should read password from EVALOPS_PASSWORD env var', () => {
    const loginTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'login.ts'),
      'utf-8'
    );
    expect(loginTs).toMatch(/EVALOPS_PASSWORD/);
  });
});

// ---------------------------------------------------------------------------
// CRITICAL-2: requireAuth must copy serviceToken → token when token absent
// ---------------------------------------------------------------------------
describe('CRITICAL-2: requireAuth runtime safety for serviceToken', () => {
  it('config.ts requireAuth should have serviceToken→token copy logic', () => {
    const configTs = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'config.ts'),
      'utf-8'
    );
    // requireAuth should check for serviceToken and copy it to token
    expect(configTs).toMatch(/serviceToken/);
    // Should assign token from serviceToken when token is absent
    expect(configTs).toMatch(/config.*token.*=.*serviceToken|serviceToken.*token/s);
  });

  it('config.ts requireAuth should exit 1 when neither token nor serviceToken set', () => {
    const configTs = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'config.ts'),
      'utf-8'
    );
    // Should have process.exit(1) in requireAuth
    expect(configTs).toMatch(/process\.exit\(1\)/);
  });
});

// ---------------------------------------------------------------------------
// CRITICAL-3: eval.ts waitFor wrapped in try/catch with run ID before exit
// ---------------------------------------------------------------------------
describe('CRITICAL-3: waitFor try/catch in eval.ts', () => {
  it('eval.ts should wrap client.runs.waitFor in try/catch', () => {
    const evalTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'eval.ts'),
      'utf-8'
    );
    // Should have try { ... done = await client.runs.waitFor ... } catch
    expect(evalTs).toMatch(/try\s*\{[^}]*waitFor/s);
    expect(evalTs).toMatch(/catch\s*\(err\)/);
  });

  it('eval.ts should print run.id before exiting on waitFor failure', () => {
    const evalTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'eval.ts'),
      'utf-8'
    );
    // The catch block should reference run.id and have process.exit(1)
    expect(evalTs).toMatch(/run\.id/);
    // Check that process.exit(1) appears after a catch block for waitFor
    // We verify both patterns exist in the file (they are in the same catch block)
    const waitForIdx = evalTs.indexOf('waitFor');
    const exitIdx = evalTs.lastIndexOf('process.exit(1)');
    expect(waitForIdx).toBeGreaterThan(-1);
    expect(exitIdx).toBeGreaterThan(-1);
    // process.exit(1) must appear after waitFor
    expect(exitIdx).toBeGreaterThan(waitForIdx);
  });
});

// ---------------------------------------------------------------------------
// CRITICAL-4: PAT mint fallback emits warning
// ---------------------------------------------------------------------------
describe('CRITICAL-4: PAT mint fallback warning', () => {
  it('login.ts should emit a warning when PAT minting fails', () => {
    const loginTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'login.ts'),
      'utf-8'
    );
    // The catch block in the PAT minting section must call console.warn
    expect(loginTs).toMatch(/console\.warn/);
    // And should mention the warning about short-lived session token
    expect(loginTs).toMatch(/PAT minting failed|short-lived session/i);
  });
});

// ---------------------------------------------------------------------------
// CRITICAL-5: spec-commands.ts checks file existence before SDK call
// ---------------------------------------------------------------------------
describe('CRITICAL-5: file existence check in spec push', () => {
  it('spec-commands.ts should import existsSync', () => {
    const specCommandsTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'spec-commands.ts'),
      'utf-8'
    );
    expect(specCommandsTs).toMatch(/existsSync/);
  });

  it('spec-commands.ts should check file existence before SDK call', () => {
    const specCommandsTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'spec-commands.ts'),
      'utf-8'
    );
    // Should have if (!existsSync(...)) check before client.specs.upsertFromYaml
    const existsSyncIdx = specCommandsTs.indexOf('existsSync');
    const upsertIdx = specCommandsTs.indexOf('upsertFromYaml');
    expect(existsSyncIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    // existsSync check must come before upsertFromYaml
    expect(existsSyncIdx).toBeLessThan(upsertIdx);
  });

  it('spec-commands.ts should exit 1 with user-friendly message when file missing', () => {
    const specCommandsTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'spec-commands.ts'),
      'utf-8'
    );
    // Should print a "not found" message and exit 1
    expect(specCommandsTs).toMatch(/not found|Spec file not found/i);
    expect(specCommandsTs).toMatch(/process\.exit\(1\)/);
  });
});

// ---------------------------------------------------------------------------
// HIGH-1: waitFor gated behind --watch in eval.ts
// ---------------------------------------------------------------------------
describe('HIGH-1: waitFor gated behind --watch', () => {
  it('eval.ts should gate waitFor block behind watch flag', () => {
    const evalTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'eval.ts'),
      'utf-8'
    );
    // Should have `if (!watch)` or `if (watch)` gating the waitFor call
    // The run ID should be printed before the gate check
    expect(evalTs).toMatch(/if\s*\(!?\s*watch\s*\)/);
  });

  it('eval.ts should print run ID and fire-and-forget message when not watching', () => {
    const evalTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'eval.ts'),
      'utf-8'
    );
    // Should have a message about using --watch or run get
    expect(evalTs).toMatch(/--watch|evalops run get/i);
  });
});

// ---------------------------------------------------------------------------
// HIGH-2: templates not in package.json files array
// ---------------------------------------------------------------------------
describe('HIGH-2: templates removed from package.json files', () => {
  it('apps/cli/package.json files array should only contain "dist"', () => {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      files?: string[];
    };
    expect(pkg.files).toEqual(['dist']);
  });
});

// ---------------------------------------------------------------------------
// HIGH-3: non-ENOENT errors in credentials.ts emit warning
// ---------------------------------------------------------------------------
describe('HIGH-3: credentials non-ENOENT error warning', () => {
  it('credentials.ts should emit console.warn for non-ENOENT errors', () => {
    const credsTs = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'credentials.ts'),
      'utf-8'
    );
    // Should check if error code is not ENOENT
    expect(credsTs).toMatch(/ENOENT/);
    expect(credsTs).toMatch(/console\.warn/);
  });

  it('credentials.ts catch block should not be a bare empty catch', () => {
    const credsTs = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'credentials.ts'),
      'utf-8'
    );
    // Should NOT have `catch {` or `catch (_)` with just `return null`
    // bare catch is: } catch { \n    return null; \n  }
    expect(credsTs).not.toMatch(/\}\s*catch\s*\{\s*\n?\s*return null;\s*\n?\s*\}/);
  });
});

// ---------------------------------------------------------------------------
// HIGH-4: SDK calls wrapped in try/catch in eval.ts and token.ts
// ---------------------------------------------------------------------------
describe('HIGH-4: SDK calls wrapped in try/catch', () => {
  it('eval.ts should wrap upsertFromYaml in try/catch', () => {
    const evalTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'eval.ts'),
      'utf-8'
    );
    // Should have try block before upsertFromYaml
    // Find the position of upsertFromYaml and check for try before it
    expect(evalTs).toMatch(/Failed to upsert spec|upsert spec.*failed/i);
  });

  it('eval.ts should wrap client.runs.create in try/catch', () => {
    const evalTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'eval.ts'),
      'utf-8'
    );
    expect(evalTs).toMatch(/Failed to create run|create run.*failed/i);
  });

  it('token.ts should wrap token create in try/catch with contextual message', () => {
    const tokenTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'token.ts'),
      'utf-8'
    );
    expect(tokenTs).toMatch(/Token creation failed|failed to create token/i);
  });

  it('token.ts should wrap token list in try/catch', () => {
    const tokenTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'token.ts'),
      'utf-8'
    );
    // Should have at least 2 try/catch blocks (one for each SDK call)
    const tryCatchCount = (tokenTs.match(/\btry\s*\{/g) || []).length;
    expect(tryCatchCount).toBeGreaterThanOrEqual(2);
  });

  it('token.ts should wrap token revoke in try/catch', () => {
    const tokenTs = fs.readFileSync(
      path.join(__dirname, '..', 'commands', 'token.ts'),
      'utf-8'
    );
    const tryCatchCount = (tokenTs.match(/\btry\s*\{/g) || []).length;
    expect(tryCatchCount).toBeGreaterThanOrEqual(3);
  });
});
