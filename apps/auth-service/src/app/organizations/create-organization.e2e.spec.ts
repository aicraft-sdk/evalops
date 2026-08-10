/**
 * Real end-to-end proof of the self-service create-organization flow:
 * a fresh registrant (role='viewer' in default-org, no ORG_ADMIN anywhere)
 * calls the REAL `POST /api/organizations` HTTP endpoint through the REAL
 * NestJS pipeline (JwtAuthGuard, controllers, services, repositories)
 * against a real (isolated, disposable) SQLite dev-mode DB — not a mocked
 * repository, not a mocked guard.
 *
 * Closes the catch-22 described in the task: previously `POST /organizations`
 * required @Roles(ORG_ADMIN, ADMIN), which a fresh registrant can never hold,
 * so nobody could ever create a second organization.
 *
 * Setup note: the starting "viewer in default-org" user is seeded via a
 * direct raw-SQL insert (not through `POST /auth/register`) because
 * `AuthService.register()` writes `isActive: true` (a JS boolean) through a
 * Postgres-typed `boolean()` column — better-sqlite3's bind layer rejects
 * raw JS booleans outright (a real, pre-existing, out-of-scope dev-mode/
 * SQLite gap, not something this task touches). The feature actually under
 * test — the create-organization endpoint, its guard, service, and
 * transactional repository write — is exercised for real via HTTP with a
 * JWT minted by the real `JwtService`.
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
process.env['JWT_SECRET'] = 'test-secret-create-organization-e2e';

const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-create-org-e2e-'));
const dbPath = join(tmpDir, 'test.db');
process.env['EVALOPS_DEV_DB_PATH'] = dbPath;

const seededUserId = randomUUID();
const seededEmail = 'newco-founder@example.com';

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
  .run(seededUserId, seededEmail, 'unused-not-logging-in-with-password', 'Nora', 'Newco', nowIso, nowIso);
rawDb.close();

const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { AppModule } = require('../app.module');
const { OrganizationsRepository, UsersRepository } = require('@evalops/shared-db');

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('Self-service create-organization (real HTTP + real SQLite dev-mode DB)', () => {
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

  it('lets a viewer-role registrant create a new org, become its ORG_ADMIN, keep their default-org role unchanged, and still be denied managing an org they do not own', async () => {
    // 1. Mint a real JWT (real JwtService, real secret, real signature) for
    //    the seeded viewer-in-default-org user — the exact starting state
    //    a fresh registrant is in.
    const jwtService = moduleRef.get(JwtService);
    const token: string = jwtService.sign({
      sub: seededUserId,
      email: seededEmail,
      organizationId: 'default-org',
      roles: ['viewer'],
    });
    const userId = seededUserId;

    // 2. Create a brand-new org as this viewer-role, non-ORG_ADMIN user —
    //    the exact catch-22 scenario: previously impossible (403).
    const createRes = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Newco Inc' })
      .expect(201);

    const newOrgId: string = createRes.body.id;
    expect(createRes.body.name).toBe('Newco Inc');
    expect(newOrgId).toBeTruthy();
    expect(newOrgId).not.toBe('default-org');

    // 3. Verify via real DB read: the user is ORG_ADMIN of the NEW org.
    const orgsRepo = moduleRef.get(OrganizationsRepository);
    const membership = await orgsRepo.findMembership(newOrgId, userId);
    expect(membership).toBeDefined();
    expect(membership.role).toBe('org_admin');
    expect(membership.organizationId).toBe(newOrgId);
    expect(membership.userId).toBe(userId);

    // 4. Verify via real DB read: their default-org role is UNCHANGED —
    //    creating a new org did not touch users.organizationId/role at all.
    const usersRepo = moduleRef.get(UsersRepository);
    const userRow = await usersRepo.findById(userId);
    expect(userRow?.organizationId).toBe('default-org');
    expect(userRow?.role).toBe('viewer');

    // 5. Regression: still cannot manage an EXISTING org (default-org) via
    //    the ADMIN-only route — the RBAC check for managing an org you don't
    //    own is untouched by the create-org exemption.
    await request(app.getHttpServer())
      .post('/api/admin/organizations/default-org')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hijacked Name' })
      .expect(403);
  });

  it('ignores a client-supplied id/createdAt/updatedAt in the create-organization request body', async () => {
    const jwtService = moduleRef.get(JwtService);
    const token: string = jwtService.sign({
      sub: seededUserId,
      email: seededEmail,
      organizationId: 'default-org',
      roles: ['viewer'],
    });

    const attackerSuppliedId = 'attacker-controlled-id';
    const attackerSuppliedTimestamp = '2000-01-01T00:00:00.000Z';

    const createRes = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Spoofed Org',
        id: attackerSuppliedId,
        createdAt: attackerSuppliedTimestamp,
        updatedAt: attackerSuppliedTimestamp,
      })
      .expect(201);

    expect(createRes.body.id).not.toBe(attackerSuppliedId);
    expect(createRes.body.createdAt).not.toBe(attackerSuppliedTimestamp);
    expect(createRes.body.updatedAt).not.toBe(attackerSuppliedTimestamp);
  });
});
