import { readFileSync, existsSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import type { LicenseClaims, EnterpriseFeature, signLicenseEnvelope as SignFn } from '@evalops/licensing';

// `libs/licensing/package.json` declares `"type": "commonjs"` (matches every other
// `libs/*` package — Nx-built libraries are consumed as CJS by every real app via
// TypeScript-compiler-level module resolution, never via Node's own ESM loader). This
// script is the FIRST place in the repo that loads a `@evalops/*` library directly
// through Node's ESM `import` machinery (via `tsx --tsconfig tsconfig.base.json`, per
// this plan's own documented tsx/tsconfig gap). Confirmed live: `import { signLicenseEnvelope }
// from '@evalops/licensing'` throws `SyntaxError: ... does not provide an export named
// 'signLicenseEnvelope'` when this script runs from inside the repo tree, because Node's
// ESM/CJS interop resolves named exports of a CJS module via static `cjs-module-lexer`
// analysis of the compiled `export *` re-export chain, which cannot statically see
// through it — even though the export genuinely exists at runtime. A plain CommonJS
// `require()` (via `createRequire`) returns the real `module.exports` object directly,
// with no static-analysis limitation, and reliably resolves every export. Only the
// TYPE import above needs the ESM path (types are erased before runtime, so this never
// hits the same bug).
const require = createRequire(import.meta.url);
const licensing: { signLicenseEnvelope: typeof SignFn } = require('@evalops/licensing');

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (!key || value === undefined) {
      throw new Error(`Malformed argument at position ${i}: expected "--flag value" pairs.`);
    }
    out[key] = value;
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const required = ['private-key', 'license-id', 'org-name', 'features', 'expires-at'];
  const missing = required.filter((k) => !args[k]);
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.map((k) => `--${k}`).join(', ')}`);
    console.error(
      'Usage: tsx scripts/licensing/sign-license.ts --private-key <path-or-pem> ' +
        '--license-id <id> --org-name <name> --features sso,audit-export ' +
        '--expires-at <ISO-date> [--issued-at <ISO-date>] [--out <path>]',
    );
    process.exit(1);
  }

  const privateKeyPem = existsSync(args['private-key'])
    ? readFileSync(args['private-key'], 'utf-8')
    : args['private-key'];

  const claims: LicenseClaims = {
    licenseId: args['license-id'],
    orgName: args['org-name'],
    features: args['features'].split(',').map((f) => f.trim()) as EnterpriseFeature[],
    issuedAt: args['issued-at'] ?? new Date().toISOString(),
    expiresAt: args['expires-at'],
  };

  const envelope = licensing.signLicenseEnvelope(claims, privateKeyPem);

  if (args['out']) {
    writeFileSync(args['out'], envelope, 'utf-8');
    console.log(`Signed license envelope written to ${args['out']}`);
  } else {
    console.log(envelope);
  }
}

main();
