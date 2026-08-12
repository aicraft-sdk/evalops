/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// apps/frontend previously had no working vitest config of its own — the
// only one in the repo (root vitest.config.ts) points at a dead pre-Nx
// ./client/src / ./shared / ./server layout and has no `globals: true`, so
// apps/frontend/src/test/*.test.tsx files (which rely on a global `expect`
// via jest-dom) could not actually run. This config scopes vitest to
// apps/frontend with the same resolve aliases as vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@evalops/shared': path.resolve(__dirname, '../../libs/shared/src'),
      '@evalops/shared-db': path.resolve(__dirname, '../../libs/shared-db/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
  },
});
