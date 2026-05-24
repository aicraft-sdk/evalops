import baseConfig from '../../eslint.config.mjs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e.ts'],
    languageOptions: {
      parserOptions: {
        project: resolve(__dirname, 'tsconfig.app.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
];
