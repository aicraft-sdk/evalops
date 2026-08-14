import baseConfig from '../../eslint.config.mjs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default [
  ...baseConfig,
  {
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    languageOptions: {
      parserOptions: {
        project: resolve(__dirname, 'tsconfig.lib.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
];
