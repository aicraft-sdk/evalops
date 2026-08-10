import baseConfig from '../../eslint.config.mjs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default [
  ...baseConfig,
  {
    ignores: ['**/eslint.config.mjs'],
  },
  {
    languageOptions: {
      parserOptions: {
        project: resolve(__dirname, 'tsconfig.app.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
];
