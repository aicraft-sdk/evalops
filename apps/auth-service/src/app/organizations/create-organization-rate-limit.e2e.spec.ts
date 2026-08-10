/**
 * Real end-to-end proof that `POST /api/organizations` is rate-limited.
 *
 * Before this fix, nothing gated org creation: auth-service registered no
 * global APP_GUARD (no ThrottlerGuard, unlike api-gateway/core-service/
 * evaluation-service) and the route itself had no @UseGuards(RateLimitGuard)/
 * @RateLimit — a single authenticated user could create unbounded
 * organizations. This proves that rapid repeated calls beyond the configured
 * limit are rejected with 429, using the same RateLimitGuard/@RateLimit
 * convention already established in evaluation-service's ingestion route
 * (@evalops/shared-auth), backed by the in-memory Redis facade that
 * `RedisModule` provides automatically under EVALOPS_DEV_MODE=1.
 *
 * EVALOPS_DEV_MODE / JWT_SECRET / EVALOPS_DEV_DB_PATH must be set BEFORE
 * `@evalops/shared-db` (and anything that transitively imports it, like
 * AppModule) is first required — db.ts reads these at module-load time.
 * That is why the DB-touching imports below are deferred `require()` calls
 * inside `beforeAll`, executed only after the env vars and the on-disk
 * SQLite schema have been prepared. This spec uses its own isolated DB file
 * and Nest app instance (separate from create-organization.e2e.spec.ts) so
 * its rapid-fire requests cannot be affected by, or affect, other org-
 * creation tests sharing the same in-memory rate-limit counters.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env['EVALOPS_DEV_MODE'] = '1';
process.env['JWT_SECRET'] = 'test-secret-create-organization-rate-limit-e2e';

const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-create-org-rate-limit-e2e-'));
const dbPath = join(tmpDir, 'test.db');
process.env['EVALOPS_DEV_DB_PATH'] = dbPath;

const seededUserId = randomUUID();
const seededEmail = 'rate-limit-founder@example.com';

const Database = require('better-sqlite3');
const rawDb = new Database(dbPath);
rawDb.exec(`
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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
  CREATE TABLE organization_members (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT
  );
`);
const nowIso = new Date().toISOString();
rawDb
  .prepare(
    `INSERT INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  )
  .run('default-org', 'Default Organization', nowIso, nowIso);
rawDb
  .prepare(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'viewer', 'default-org', 1, ?, ?)`,
  )
  .run(seededUserId, seededEmail, 'unused-not-logging-in-with-password', 'Rae', 'Limiter', nowIso, nowIso);
rawDb.close();

const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { AppModule } = require('../app.module');

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('POST /organizations rate limiting (real HTTP + real SQLite dev-mode DB)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects org creation once a single user exceeds the configured rate limit', async () => {
    const jwtService = moduleRef.get(JwtService);
    const token: string = jwtService.sign({
      sub: seededUserId,
      email: seededEmail,
      organizationId: 'default-org',
      roles: ['viewer'],
    });

    // The route's configured limit is 5 requests/60s (see @RateLimit on
    // OrganizationsController.createOrganization). Fire 6 rapid requests
    // from the SAME user: the first 5 must succeed, the 6th must be
    // rejected with 429 Too Many Requests.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Rate Limit Test Org ${i}` });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});
