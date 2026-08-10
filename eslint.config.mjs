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
              ],
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
];
