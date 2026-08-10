import baseConfig from '../../eslint.config.mjs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default [
  ...baseConfig,
  {
    ignores: ['**/eslint.config.mjs', '**/jest.config.cts'],
  },
  {
    languageOptions: {
      parserOptions: {
        project: [
          resolve(__dirname, 'tsconfig.lib.json'),
          resolve(__dirname, 'tsconfig.spec.json'),
        ],
        tsconfigRootDir: __dirname,
      },
    },
  },
];
