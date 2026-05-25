/**
 * In-process platform for evalops dev mode.
 *
 * Pragmatic Phase 3 implementation: starts a minimal Express server
 * that responds to health checks. Full NestJS sub-app mounting is deferred
 * to a future phase once bundling strategy is resolved.
 *
 * The function signature accepts optional serviceModules for forward
 * compatibility, but the current implementation uses a simple Express stub.
 */

export interface InProcessPlatform {
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}

export interface InProcessPlatformOptions {
  port?: number;
}

export async function createInProcessPlatform(
  _opts: InProcessPlatformOptions = {},
): Promise<InProcessPlatform> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  // express is a callable function when loaded via require
  const server = (express as unknown as () => ReturnType<typeof import('express')>)();

  // Health check endpoint
  server.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'dev', version: '0.1.0' });
  });

  // Catch-all for unimplemented routes
  server.use((_req, res) => {
    res.status(501).json({
      error: 'not_implemented',
      message:
        'Full service embedding is a Phase 3+ feature. Run individual services with nx serve.',
    });
  });

  let httpServer: ReturnType<typeof server.listen> | null = null;

  return {
    async listen(port: number) {
      await new Promise<void>((resolve) => {
        httpServer = server.listen(port, () => resolve());
      });
    },
    async close() {
      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer!.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  };
}
