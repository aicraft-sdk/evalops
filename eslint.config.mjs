import nx from '@nx/eslint-plugin';

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
  {
    // Compensating control for @nx/enforce-module-boundaries' scope:enterprise constraint
    // (see Task 2.3 above): that rule only inspects static import/import() AST nodes, so a
    // require()/eval() call naming an ee/* path or an @evalops/ee-* package is invisible to
    // it. This flags the obvious/easy case as a coarse net — it is NOT a full solution to
    // arbitrary obfuscation (dynamically built strings, indirect eval, etc). See ee/README.md
    // "Known limitation" section for the accepted-risk framing.
    // NOTE: Nx's inferred lint target runs `eslint .` with `cwd` set to each project's own
    // directory (see `nx show project <name> --json`), so `files` glob patterns here are
    // matched relative to that project directory, NOT the workspace root — an
    // `apps/**`/`libs/**`-prefixed pattern would silently never match under `nx lint <project>`.
    //
    // Each Literal-node selector below has a TemplateLiteral counterpart matching a
    // zero-interpolation template literal (quasis.length === 1 / expressions.length === 0 —
    // i.e. functionally a plain string, not real obfuscation, e.g. require(`ee/sso`)). This
    // closes the template-literal bypass found in review while intentionally NOT attempting to
    // catch template literals WITH interpolation (e.g. require(`ee/${x}`)) — that remains a
    // genuinely open gap, documented in ee/README.md.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
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
];
