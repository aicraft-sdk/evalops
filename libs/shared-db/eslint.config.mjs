import baseConfig from '../../eslint.config.mjs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default [
  ...baseConfig,
  {
    ignores: ['**/eslint.config.mjs', '**/drizzle.config.ts'],
  },
  {
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: resolve(__dirname, 'tsconfig.lib.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
];
