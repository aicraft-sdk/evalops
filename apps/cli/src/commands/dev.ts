import { Command } from 'commander';
import { randomBytes, createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * `evalops dev` — starts an embedded EvalOps platform.
 *
 * Phase 3 pragmatic implementation:
 * 1. Sets EVALOPS_DEV_MODE=1 (must happen before any shared-db import)
 * 2. Loads / generates secrets in ~/.evalops/dev.env
 * 3. Seeds default org + admin user + PAT in SQLite (~/.evalops/dev.db)
 * 4. Starts a minimal Express health-check server
 *
 * Full NestJS sub-app mounting is deferred to Phase 3+.
 * Use `nx serve auth-service` etc. for full service development.
 */
export function registerDev(program: Command): void {
  program
    .command('dev')
    .description(
      'Start an embedded EvalOps platform (SQLite, no Docker required)',
    )
    .option('--port <port>', 'Port to listen on', '3100')
    .option('--with-python', 'Also start the Python worker process')
    .action(async (opts: { port: string; withPython?: boolean }) => {
      // CRITICAL: set DEV_MODE before any shared-db or service module is loaded
      process.env['EVALOPS_DEV_MODE'] = '1';

      const port = parseInt(opts.port, 10);
      const devDir = join(homedir(), '.evalops');
      const devEnvPath = join(devDir, 'dev.env');

      // Ensure ~/.evalops exists
      mkdirSync(devDir, { recursive: true });

      // ── Load or generate secrets ───────────────────────────────────────────
      let jwtSecret: string;
      let serviceSecret: string;

      if (existsSync(devEnvPath)) {
        const raw = readFileSync(devEnvPath, 'utf8');
        const env: Record<string, string> = Object.fromEntries(
          raw
            .split('\n')
            .filter((l) => l.includes('=') && !l.startsWith('#'))
            .map((l) => {
              const idx = l.indexOf('=');
              return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] as [
                string,
                string,
              ];
            }),
        );
        jwtSecret =
          env['JWT_SECRET'] ?? randomBytes(48).toString('base64url');
        serviceSecret =
          env['SERVICE_SECRET'] ?? randomBytes(48).toString('base64url');
      } else {
        jwtSecret = randomBytes(48).toString('base64url');
        serviceSecret = randomBytes(48).toString('base64url');
      }

      // Set secrets into process.env before any NestJS modules load
      process.env['JWT_SECRET'] = jwtSecret;
      process.env['SERVICE_SECRET'] = serviceSecret;
      // Sentinel values — db.ts checks EVALOPS_DEV_MODE first so these are not used
      process.env['DATABASE_URL'] = 'sqlite://dev';
      process.env['REDIS_HOST'] = 'localhost';
      process.env['REDIS_PORT'] = '6379';

      // ── Seed default org + admin user + PAT in SQLite ─────────────────────
      let pat: string | undefined;
      try {
        // Dynamic import to ensure DEV_MODE is already set
        const { getSqliteDb } = await import(
          '@evalops/dev-runtime'
        );
        const db = getSqliteDb();

        // Lazily import SQLite schema
        const schema = await import('@evalops/shared-db/sqlite-schema');

        // Create tables if they don't exist (DDL via drizzle)
        // Better-sqlite3 + drizzle doesn't auto-migrate; we push tables manually
        const sqlite = (db as unknown as { session: unknown })['session'];
        // Access the underlying Database instance through drizzle internals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawDb = (db as any)['session']?.client ?? (db as any)['_instance'];

        if (rawDb && typeof rawDb.exec === 'function') {
          // Create core tables if they don't exist
          rawDb.exec(`
            CREATE TABLE IF NOT EXISTS organizations (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              slug TEXT,
              created_at TEXT,
              updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT UNIQUE,
              password_hash TEXT,
              first_name TEXT,
              last_name TEXT,
              profile_image_url TEXT,
              role TEXT NOT NULL DEFAULT 'viewer',
              organization_id TEXT NOT NULL,
              entra_id TEXT UNIQUE,
              upn TEXT,
              tenant_id TEXT,
              department TEXT,
              job_title TEXT,
              is_active INTEGER DEFAULT 1,
              last_login_at TEXT,
              created_at TEXT,
              updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS personal_access_tokens (
              id TEXT PRIMARY KEY,
              organization_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              name TEXT NOT NULL,
              token_hash TEXT NOT NULL UNIQUE,
              scopes TEXT NOT NULL DEFAULT '[]',
              expires_at TEXT,
              last_used_at TEXT,
              revoked_at TEXT,
              created_at TEXT
            );
          `);
        }

        // Check if already seeded by looking for existing orgs
        const existingOrgs = await db
          .select()
          .from(schema.organizations)
          .limit(1);

        if (existingOrgs.length === 0) {
          const orgId = randomBytes(8).toString('hex');
          const userId = randomBytes(8).toString('hex');

          // Seed org
          await db.insert(schema.organizations).values({
            id: orgId,
            name: 'Local Dev',
            slug: 'local-dev',
          } as typeof schema.organizations.$inferInsert);

          // Seed admin user
          let passwordHash: string = 'dev-hash-placeholder';
          try {
            const bcrypt = await import('bcrypt');
            passwordHash = await bcrypt.default.hash('dev-admin', 10);
          } catch (err) {
            console.warn('Warning: failed to hash admin password:', err instanceof Error ? err.message : String(err));
          }

          await db.insert(schema.users).values({
            id: userId,
            email: 'admin@localhost',
            passwordHash,
            firstName: 'Dev',
            lastName: 'Admin',
            role: 'admin',
            organizationId: orgId,
          } as typeof schema.users.$inferInsert);

          // Mint a PAT for the admin user
          const rawPat = `evops_pat_${randomBytes(32).toString('base64url')}`;
          const tokenHash = createHash('sha256').update(rawPat).digest('hex');
          const expiresAt = new Date(
            Date.now() + 365 * 86_400_000,
          ).toISOString();

          await db.insert(schema.personalAccessTokens).values({
            id: randomBytes(8).toString('hex'),
            organizationId: orgId,
            userId,
            name: 'dev-auto',
            tokenHash,
            scopes: JSON.stringify([]),
            expiresAt,
          } as typeof schema.personalAccessTokens.$inferInsert);

          pat = rawPat;

          // Write dev.env (mode 0600)
          const devEnvContent = [
            `JWT_SECRET=${jwtSecret}`,
            `SERVICE_SECRET=${serviceSecret}`,
            `EVALOPS_TOKEN=${rawPat}`,
            `EVALOPS_URL=http://localhost:${port}`,
          ].join('\n') + '\n';

          writeFileSync(devEnvPath, devEnvContent, { mode: 0o600 });
          console.log(`\nDev environment seeded.`);
          console.log(`Credentials written to: ${devEnvPath}`);
          console.log(`  Admin email: admin@localhost`);
          console.log(`  Admin password: dev-admin`);
        } else {
          // Read existing PAT from dev.env
          if (existsSync(devEnvPath)) {
            const raw = readFileSync(devEnvPath, 'utf8');
            const m = raw.match(/^EVALOPS_TOKEN=(.+)$/m);
            if (m) pat = m[1];
          }
          console.log('\nUsing existing dev database at ~/.evalops/dev.db');
        }
      } catch (err) {
        console.warn(
          'Warning: could not seed dev database:',
          (err as Error).message,
        );
        console.warn(
          'The platform will start but you may need to create users manually.',
        );
      }

      // ── Start the in-process platform ─────────────────────────────────────
      console.log('\nStarting EvalOps dev platform...');
      try {
        const { createInProcessPlatform } = await import('@evalops/dev-runtime');
        const platform = await createInProcessPlatform();
        await platform.listen(port);
      } catch (err) {
        console.error('Failed to start dev platform:', (err as Error).message);
        process.exit(1);
      }

      console.log(
        `\nEvalOps dev platform running on http://localhost:${port}`,
      );
      console.log(`  Health check: http://localhost:${port}/api/health`);
      console.log(
        `\n  Note: This is a Phase 3 partial dev mode.`,
      );
      console.log(
        `  For full service APIs, run individual services with:`,
      );
      console.log(`    nx serve auth-service core-service evaluation-service`);

      if (pat) {
        console.log(
          `\n  Token: ${pat.slice(0, 20)}...  (full token in ${devEnvPath})`,
        );
        console.log(
          `  To use: export EVALOPS_TOKEN=$(grep EVALOPS_TOKEN ${devEnvPath} | cut -d= -f2)`,
        );
      }

      if (opts.withPython) {
        const { spawn } = await import('child_process');
        const pyWorker = spawn('uv', ['run', 'python_worker/main.py'], {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
        pyWorker.on('error', (e) =>
          console.warn('Python worker failed to start:', e.message),
        );
        console.log('Python worker started (--with-python)');
      }
    });
}
