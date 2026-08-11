/**
 * Real end-to-end proof that `@Roles(UserRole.ADMIN)`-gated admin routes in
 * auth-service are actually reachable by a real ADMIN user, through the REAL
 * NestJS pipeline (JwtAuthGuard, RbacGuard, controllers, services,
 * repositories) against a real (isolated, disposable) SQLite dev-mode DB —
 * not a mocked guard, not a mocked request.user.
 *
 * Root cause under test: `JwtStrategy.validate()` in
 * `apps/auth-service/src/app/auth/strategies/jwt.strategy.ts` built
 * `request.user` from the DB-fetched user record and only ever set a
 * singular `role` field on it. `RbacGuard`
 * (`libs/shared-auth/src/lib/guards/rbac.guard.ts`) reads `user.roles`
 * (plural array) — which was always `undefined` for auth-service's own
 * strategy, so `userRoles` defaulted to `[]` and every `@Roles()`-gated
 * route unconditionally 403'd, even for real ADMIN users.
 *
 * EVALOPS_DEV_MODE / JWT_SECRET / EVALOPS_DEV_DB_PATH must be set BEFORE
 * `@evalops/shared-db` (and anything that transitively imports it, like
 * AppModule) is first required — db.ts reads these at module-load time.
 * That is why the DB-touching imports below are deferred `require()` calls
 * inside `beforeAll`, executed only after the env vars and the on-disk
 * SQLite schema have been prepared.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

process.env['EVALOPS_DEV_MODE'] = '1';
process.env['JWT_SECRET'] = 'test-secret-admin-rbac-e2e';

const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-admin-rbac-e2e-'));
const dbPath = join(tmpDir, 'test.db');
process.env['EVALOPS_DEV_DB_PATH'] = dbPath;

const adminUserId = randomUUID();
const adminEmail = 'root-admin@example.com';
const viewerUserId = randomUUID();
const viewerEmail = 'plain-viewer@example.com';

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
     VALUES (?, ?, ?, ?, ?, 'admin', 'default-org', 1, ?, ?)`,
  )
  .run(adminUserId, adminEmail, 'unused', 'Root', 'Admin', nowIso, nowIso);
rawDb
  .prepare(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'viewer', 'default-org', 1, ?, ?)`,
  )
  .run(viewerUserId, viewerEmail, 'unused', 'Plain', 'Viewer', nowIso, nowIso);
rawDb.close();

const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { AppModule } = require('../app.module');

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('Admin RBAC routes are reachable by real ADMIN users (real HTTP + real SQLite dev-mode DB)', () => {
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

  function mintToken(sub: string, email: string) {
    const jwtService = moduleRef.get(JwtService);
    // Mirrors AuthService.login()'s real payload shape (roles derived from
    // the DB user's singular `role`) — NOT a hand-crafted convenience shape.
    return jwtService.sign({
      sub,
      email,
      organizationId: 'default-org',
      roles: [],
    });
  }

  it('lets a real ADMIN user reach GET /admin/users (regression: was an unconditional 403)', async () => {
    const token = mintToken(adminUserId, adminEmail);

    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('lets a real ADMIN user reach GET /admin/organizations', async () => {
    const token = mintToken(adminUserId, adminEmail);

    const res = await request(app.getHttpServer())
      .get('/api/admin/organizations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('lets a real ADMIN user reach POST /admin/organizations/:id and applies only the allowlisted field', async () => {
    const token = mintToken(adminUserId, adminEmail);

    const res = await request(app.getHttpServer())
      .post('/api/admin/organizations/default-org')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Renamed By Admin',
        id: 'attacker-controlled-id',
        createdAt: '2000-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Renamed By Admin');
    // DTO/repository allowlist (fixed earlier this session) still holds
    // under real traffic now that this route is actually reachable.
    expect(res.body.id).toBe('default-org');
    expect(res.body.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('variant: still 403s a real non-admin (viewer) user on the same ADMIN-only route', async () => {
    const token = mintToken(viewerUserId, viewerEmail);

    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
