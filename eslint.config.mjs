import nx from '@nx/eslint-plugin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';

// Nx's inferred lint target runs `eslint .` with `cwd` set to each project's own directory
// (see `nx show project <name> --json` -> targets.lint.options.cwd), and every project's own
// eslint.config.mjs just re-exports this root config's array unchanged. Flat-config `files`/
// `ignores` glob patterns are matched relative to that same cwd — which is already INSIDE the
// project directory by the time this file is evaluated — so neither an `apps/**` nor a
// `libs/**`-prefixed glob pattern can ever match here (confirmed empirically: see the
// no-restricted-syntax override below).
//
// process.cwd() is NOT a reliable way to derive the project's top-level workspace directory
// (apps/libs/ee), even though it looks that way for `nx:run-commands`-executed lint targets:
// `@nx/eslint:lint` (used by libs/shared-db, sdk-formatters, evaluators, agent-md, shared, sdk,
// and apps/cli, apps/frontend) does `process.chdir(context.root)` — i.e. back to the workspace
// root — BEFORE this module is ever evaluated (see
// node_modules/@nx/eslint/src/executors/lint/lint.impl.js), so `process.cwd()` at config-eval
// time is the workspace root for those projects, not their own directory. That silently
// evaluated `isOssLibProject` to `false` (and the ee/* require()/eval() compensating control
// below to inert) for exactly those projects — proven via a real `require('ee/sso')` probe
// added to libs/shared-db that produced zero findings.
//
// Instead, use NX_TASK_TARGET_PROJECT — confirmed against
// node_modules/nx/src/tasks-runner/task-env.js (`getNxEnvVariablesForTask`) to be set by Nx's
// task orchestrator for EVERY task's forked process, regardless of executor — to get the
// current project's *name*, then resolve that name to its top-level workspace directory via a
// synchronous, one-time (module-load-time) scan of apps/*/project.json, libs/*/project.json,
// and ee/*/project.json for a matching `name` field. This does not assume project names match
// their directory basename (they don't for ee/*: ee/sso's project name is "ee-sso", not "sso").
const workspaceRoot = dirname(fileURLToPath(import.meta.url));

function buildProjectNameToTopLevelDirMap() {
  const map = new Map();
  for (const topLevelDir of ['apps', 'libs', 'ee']) {
    const topLevelPath = join(workspaceRoot, topLevelDir);
    if (!existsSync(topLevelPath)) continue;
    for (const entry of readdirSync(topLevelPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectJsonPath = join(topLevelPath, entry.name, 'project.json');
      if (!existsSync(projectJsonPath)) continue;
      try {
        const { name } = JSON.parse(readFileSync(projectJsonPath, 'utf8'));
        if (name) map.set(name, topLevelDir);
      } catch {
        // Malformed project.json — skip; treated as "unknown project" below, not a crash.
      }
    }
  }
  return map;
}

const projectNameToTopLevelDir = buildProjectNameToTopLevelDirMap();
const targetProjectName = process.env.NX_TASK_TARGET_PROJECT;
// A raw `eslint .` invocation outside any Nx target leaves NX_TASK_TARGET_PROJECT unset (this
// path is currently non-operational/moot in this repo for unrelated reasons — see re-hunt
// notes). Default to `false` (compensating control not applied) rather than guessing from cwd
// or crashing — safe because it introduces no new false negatives relative to that already-moot
// path, and every real lint invocation in this repo goes through an Nx task target.
const isOssLibProject = targetProjectName
  ? projectNameToTopLevelDir.get(targetProjectName) === 'libs'
  : false;

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:core-integration',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:core-analytics',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:core-domain',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:core-integration',
                'scope:core-analytics',
                'scope:enterprise',
              ],
            },
            {
              sourceTag: 'scope:enterprise',
              onlyDependOnLibsWithTags: [
                'scope:shared',
                'scope:core-integration',
                'scope:core-analytics',
              ],
            },
            {
              sourceTag: 'scope:frontend',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:cli',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:api-gateway',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          minimumDescriptionLength: 3,
          'ts-nocheck': true,
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
        },
      ],
    },
  },
  {
    // no-floating-promises requires type information — apply only to TypeScript
    // production source files under src/ (not spec/test/e2e files).
    // Each project ESLint config wires parserOptions.project for
    // tsconfig.app.json / tsconfig.lib.json which cover the same file set.
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
    ignores: ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e.ts', '**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // no-console is an error in all app source except CLI paths
    files: ['apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // CLI and frontend paths legitimately use console
    files: ['apps/cli/**', '**/src/cli/**', 'apps/frontend/**/*.ts', 'apps/frontend/**/*.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
  // Compensating control for @nx/enforce-module-boundaries' scope:enterprise constraint
  // (see Task 2.3 above): that rule only inspects static import/import() AST nodes, so a
  // require()/eval() call naming an ee/* path or an @evalops/ee-* package is invisible to
  // it. This flags the obvious/easy case as a coarse net — it is NOT a full solution to
  // arbitrary obfuscation (dynamically built strings, indirect eval, etc). See ee/README.md
  // "Known limitation" section for the accepted-risk framing.
  //
  // Scoped to `libs/*` only (via `isOssLibProject`, computed above from `process.cwd()`) —
  // this control exists to stop OSS libraries (libs/shared-db, libs/core-analytics,
  // libs/shared-auth, libs/licensing, etc.) from smuggling in ee/* code around the static
  // module-boundary check. `apps/*` (auth-service, core-service, evaluation-service) are the
  // depConstraints wildcard rule's explicitly intended composition roots for ee/* — they are
  // structurally PERMITTED to import ee/* libraries (see ee/README.md), so a require() there
  // for legitimate module-load-order reasons (env vars must be set before any transitive
  // @evalops/shared-db import, and ES `import` statements are hoisted above that assignment —
  // see e.g. apps/core-service/src/__tests__/enterprise-license.http-e2e.spec.ts) is not a
  // boundary bypass and must not be flagged. `ee/*` projects themselves are also excluded:
  // an ee-lib requiring another ee-lib is not an OSS/EE separation bypass either way.
  //
  // Each Literal-node selector below has a TemplateLiteral counterpart matching a
  // zero-interpolation template literal (quasis.length === 1 / expressions.length === 0 —
  // i.e. functionally a plain string, not real obfuscation, e.g. require(`ee/sso`)). This
  // closes the template-literal bypass found in review while intentionally NOT attempting to
  // catch template literals WITH interpolation (e.g. require(`ee/${x}`)) — that remains a
  // genuinely open gap, documented in ee/README.md.
  ...(isOssLibProject
    ? [
        {
          // `**/`-prefixed (not `src/**/*.ts`) because ESLint flat-config `files` patterns are
          // matched relative to `basePath`, which is the project's own directory for
          // `nx:run-commands`-executed lint targets but the WORKSPACE ROOT for
          // `@nx/eslint:lint`-executed ones (see isOssLibProject comment above) — a depth-agnostic
          // pattern matches correctly under both.
          files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
          rules: {
            'no-restricted-syntax': [
              'error',
              {
                selector:
                  "CallExpression[callee.name='require'] > Literal[value=/\\bee\\x2f|^@evalops\\x2fee-/]",
                message:
                  "require() of an ee/* (Enterprise) module bypasses @nx/enforce-module-boundaries' scope:enterprise check, which only inspects static import AST nodes. See ee/README.md.",
              },
              {
                selector:
                  "CallExpression[callee.name='require'] > TemplateLiteral[expressions.length=0][quasis.0.value.cooked=/\\bee\\x2f|^@evalops\\x2fee-/]",
                message:
                  "require() of an ee/* (Enterprise) module bypasses @nx/enforce-module-boundaries' scope:enterprise check, which only inspects static import AST nodes. See ee/README.md.",
              },
              {
                selector:
                  "CallExpression[callee.callee.name='eval'] > Literal[value=/\\bee\\x2f|^@evalops\\x2fee-/]",
                message:
                  "eval('require')(...) of an ee/* (Enterprise) module bypasses @nx/enforce-module-boundaries' scope:enterprise check, which only inspects static import AST nodes. See ee/README.md.",
              },
              {
                selector:
                  "CallExpression[callee.callee.name='eval'] > TemplateLiteral[expressions.length=0][quasis.0.value.cooked=/\\bee\\x2f|^@evalops\\x2fee-/]",
                message:
                  "eval('require')(...) of an ee/* (Enterprise) module bypasses @nx/enforce-module-boundaries' scope:enterprise check, which only inspects static import AST nodes. See ee/README.md.",
              },
              {
                selector: "ImportExpression > Literal[value=/\\bee\\x2f|^@evalops\\x2fee-/]",
                message:
                  "Dynamic import() of an ee/* (Enterprise) module with a literal path bypasses @nx/enforce-module-boundaries' scope:enterprise check. See ee/README.md.",
              },
              {
                selector:
                  "ImportExpression > TemplateLiteral[expressions.length=0][quasis.0.value.cooked=/\\bee\\x2f|^@evalops\\x2fee-/]",
                message:
                  "Dynamic import() of an ee/* (Enterprise) module with a literal path bypasses @nx/enforce-module-boundaries' scope:enterprise check. See ee/README.md.",
              },
            ],
          },
        },
      ]
    : []),
];
