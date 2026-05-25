const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { BannerPlugin } = require('webpack');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/cli'),
    clean: true,
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
    new BannerPlugin({ banner: '#!/usr/bin/env node', raw: true }),
  ],
};
