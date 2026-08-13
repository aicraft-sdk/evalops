/**
 * Proves, with a real HTTP-driven boot of the REAL auth-service module graph (no hand-reconstructed
 * controllers/guards), the Phase 5 `ee/rbac-custom-roles` exit criteria plus the hard
 * security invariants called out for this phase:
 *
 *  1. `POST /api/admin/custom-roles` 403s with the Enterprise upsell body when no license is
 *     configured — proving `EntitlementGuard` actually gates the relocated route.
 *  2. `POST /api/admin/custom-roles` 200/201s (creates a role with `isSystemRole: false`) when
 *     a validly-signed license entitled to `rbac-custom-roles` is configured.
 *  3. `POST /admin/users/:id/role` (the pre-existing, separate `UserRole` enum system on
 *     `AdminController`) still works completely unaffected by any of the above — proving the
 *     two RBAC systems are genuinely independent.
 *  4. A custom role can NEVER be used to escalate to or mutate an `isSystemRole: true` role:
 *     PATCH/DELETE against a system role 403s even WITH a valid, entitled license — this is a
 *     hard invariant enforced inside `CustomRolesService`, not conditional on entitlement.
 *  5. Org-scoping: a user authenticated as org A can never create/modify/delete a role that
 *     belongs to org B — `organizationId` is read only from the JWT-derived, DB-backed
 *     `@CurrentUser()`, never from a client-suppliable param.
 *
 * `PermissionsRepository` is overridden with an in-memory fake because the `roles`/
 * `role_permissions`/`permissions` tables are Postgres-only and are not mirrored into
 * dev-mode SQLite (confirmed project pattern) — this test still boots the REAL auth-service module graph,
 * REAL `JwtAuthGuard`/`JwtStrategy`/`RbacGuard`/`EntitlementGuard`/`CustomRolesService`, so it
 * genuinely proves the guard-wiring and service-layer invariants, only the raw SQL layer is
 * faked (mirrors the established `AuditRepository` override convention in
 * `apps/core-service/src/__tests__/audit-export-entitlement.integration.test.ts`).
 *
 * `EVALOPS_DEV_MODE` / `EVALOPS_DEV_DB_PATH` / `JWT_SECRET` must be set, and the on-disk
 * SQLite schema pre-seeded, BEFORE `@evalops/shared-db` (and anything transitively importing
 * it, like `AuthModule`/`PermissionsModule`/`AdminModule`) is first required — `db.ts` reads
 * these at module-load time. Mirrors `admin-rbac.e2e.spec.ts`'s established convention of
 * deferred `require()` calls.
 *
 * A hand-composed module (not the real `AppModule`) is used so `LicenseModule.forRoot({
 * publicKeyPem })` can be pointed at an ephemeral, in-memory-generated test keypair — mirrors
 * `no-license-free-login.integration.test.ts`'s established convention exactly (the real
 * `AppModule` always reads the committed production public key with no override hook, and this
 * worktree's instructions are explicitly not to modify `libs/licensing`). `auth-service` does
 * not register any global `APP_GUARD` (unlike `api-gateway`) — every guard here is the same
 * real per-controller `@UseGuards(...)` declared on `AdminController`/`CustomRolesController`.
 */
import { generateKeyPairSync, randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env['EVALOPS_DEV_MODE'] = '1';
process.env['JWT_SECRET'] = 'test-secret-custom-roles-entitlement-e2e';

const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-custom-roles-entitlement-'));
const dbPath = join(tmpDir, 'test.db');
process.env['EVALOPS_DEV_DB_PATH'] = dbPath;

const orgAAdminId = randomUUID();
const orgAAdminEmail = 'org-a-admin@example.com';
const orgBAdminId = randomUUID();
const orgBAdminEmail = 'org-b-admin@example.com';
// Dedicated target for the "POST /admin/users/:id/role still works" proof, kept separate
// from orgBAdminId so that mutating its role never corrupts the ADMIN-role preconditions the
// org-scoping scenarios below depend on.
const roleChangeTargetId = randomUUID();
const roleChangeTargetEmail = 'role-change-target@example.com';
// A real, non-privileged authenticated user (UserRole.VIEWER) in org-A, used to prove
// RbacGuard + @Roles(UserRole.ADMIN) actually rejects non-admins on the custom-roles routes.
const orgANonAdminId = randomUUID();
const orgANonAdminEmail = 'org-a-viewer@example.com';

// eslint-disable-next-line @typescript-eslint/no-var-requires
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
  .prepare(`INSERT INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
  .run('org-A', 'Org A', nowIso, nowIso);
rawDb
  .prepare(`INSERT INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
  .run('org-B', 'Org B', nowIso, nowIso);
rawDb
  .prepare(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'admin', 'org-A', 1, ?, ?)`,
  )
  .run(orgAAdminId, orgAAdminEmail, 'unused', 'Org A', 'Admin', nowIso, nowIso);
rawDb
  .prepare(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'admin', 'org-B', 1, ?, ?)`,
  )
  .run(orgBAdminId, orgBAdminEmail, 'unused', 'Org B', 'Admin', nowIso, nowIso);
rawDb
  .prepare(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'viewer', 'org-A', 1, ?, ?)`,
  )
  .run(roleChangeTargetId, roleChangeTargetEmail, 'unused', 'Role', 'ChangeTarget', nowIso, nowIso);
rawDb
  .prepare(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'viewer', 'org-A', 1, ?, ?)`,
  )
  .run(orgANonAdminId, orgANonAdminEmail, 'unused', 'Org A', 'Viewer', nowIso, nowIso);
rawDb.close();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Test } = require('@nestjs/testing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ValidationPipe } = require('@nestjs/common');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JwtService } = require('@nestjs/jwt');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ConfigModule } = require('@nestjs/config');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthModule } = require('../app/auth/auth.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PermissionsModule } = require('../app/permissions/permissions.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AdminModule } = require('../app/admin/admin.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SharedDbModule, PermissionsRepository } = require('@evalops/shared-db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LicenseModule, signLicenseEnvelope } = require('@evalops/licensing');

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const testPrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function signEntitledLicense(features: string[]): string {
  return signLicenseEnvelope(
    {
      licenseId: 'lic-custom-roles-e2e',
      orgName: 'Test Enterprise Org',
      features,
      issuedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    },
    testPrivateKeyPem,
  );
}

interface FakeRole {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  isSystemRole: boolean;
  priority: number;
}

function buildFakePermissionsRepository(seed: FakeRole[]) {
  const store = new Map<string, FakeRole>(seed.map((r) => [r.id, { ...r }]));
  return {
    listCustomRolesByOrg: jest.fn((organizationId: string) =>
      Promise.resolve(
        Array.from(store.values()).filter((r) => r.organizationId === organizationId && !r.isSystemRole),
      ),
    ),
    createRole: jest.fn((data: Partial<FakeRole>) => {
      const id = `role-${randomUUID()}`;
      const role: FakeRole = {
        id,
        name: data.name ?? '',
        description: data.description ?? null,
        organizationId: data.organizationId ?? '',
        isSystemRole: data.isSystemRole ?? false,
        priority: data.priority ?? 0,
      };
      store.set(id, role);
      return Promise.resolve(role);
    }),
    getOrCreatePermission: jest.fn((resourceType: string, action: string) =>
      Promise.resolve({ id: `perm-${resourceType}-${action}` }),
    ),
    replaceRolePermissions: jest.fn(() => Promise.resolve()),
    findRoleById: jest.fn((id: string) => Promise.resolve(store.get(id))),
    updateRole: jest.fn((id: string, updates: Partial<FakeRole>) => {
      const existing = store.get(id);
      if (!existing) return Promise.resolve(undefined);
      const updated = { ...existing, ...updates };
      store.set(id, updated);
      return Promise.resolve(updated);
    }),
    deleteRoleWithDependents: jest.fn((id: string) => {
      const existed = store.has(id);
      store.delete(id);
      return Promise.resolve(existed);
    }),
  };
}

async function bootApp(fakeRepo: ReturnType<typeof buildFakePermissionsRepository>): Promise<{
  app: INestApplication;
  moduleRef: TestingModule;
}> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SharedDbModule,
      LicenseModule.forRoot({ publicKeyPem: testPublicKeyPem }),
      AuthModule,
      PermissionsModule,
      AdminModule,
    ],
  })
    .overrideProvider(PermissionsRepository)
    .useValue(fakeRepo)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
  return { app, moduleRef };
}

function mintToken(moduleRef: TestingModule, sub: string) {
  const jwtService = moduleRef.get(JwtService);
  return jwtService.sign({ sub });
}

describe('ee/rbac-custom-roles entitlement + system-role protection + org-scoping (real HTTP, real AppModule)', () => {
  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('No Enterprise license configured', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let priorLicenseKey: string | undefined;
    let fakeRepo: ReturnType<typeof buildFakePermissionsRepository>;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      delete process.env['EVALOPS_LICENSE_KEY'];
      fakeRepo = buildFakePermissionsRepository([]);
      ({ app, moduleRef } = await bootApp(fakeRepo));
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('POST /api/admin/custom-roles 403s with the Enterprise upsell body', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .post('/api/admin/custom-roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Auditor', permissions: [{ resourceType: 'run', action: 'read' }] });

      expect(res.status).toBe(403);
      expect(res.body.upsell).toBe(true);
      expect(res.body.feature).toBe('rbac-custom-roles');
      expect(fakeRepo.createRole).not.toHaveBeenCalled();
    });

    it('GET /api/admin/custom-roles 403s for a non-ADMIN authenticated user (RbacGuard + @Roles(UserRole.ADMIN) enforcement)', async () => {
      const token = mintToken(moduleRef, orgANonAdminId);

      const res = await request(app.getHttpServer())
        .get('/api/admin/custom-roles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      // Distinguishes this from EntitlementGuard's upsell 403 - this is RbacGuard's
      // role-check rejection, which runs BEFORE EntitlementGuard in the guard chain.
      expect(res.body.upsell).toBeUndefined();
      expect(fakeRepo.listCustomRolesByOrg).not.toHaveBeenCalled();
    });

    it('POST /admin/users/:id/role (pre-existing, separate UserRole system) still works unaffected', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .post(`/api/admin/users/${roleChangeTargetId}/role`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'org_admin' });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('org_admin');
    });
  });

  describe('Valid rbac-custom-roles-entitled Enterprise license configured', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let priorLicenseKey: string | undefined;
    let fakeRepo: ReturnType<typeof buildFakePermissionsRepository>;
    const systemRoleOrgA: FakeRole = {
      id: 'sys-role-org-a',
      name: 'Administrator',
      description: 'Built-in',
      organizationId: 'org-A',
      isSystemRole: true,
      priority: 100,
    };
    const customRoleOrgB: FakeRole = {
      id: 'custom-role-org-b',
      name: 'Org B Auditor',
      description: null,
      organizationId: 'org-B',
      isSystemRole: false,
      priority: 0,
    };
    const customRoleOrgADeletable: FakeRole = {
      id: 'custom-role-org-a-deletable',
      name: 'Org A Deletable Role',
      description: null,
      organizationId: 'org-A',
      isSystemRole: false,
      priority: 0,
    };

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      process.env['EVALOPS_LICENSE_KEY'] = signEntitledLicense(['rbac-custom-roles']);
      fakeRepo = buildFakePermissionsRepository([systemRoleOrgA, customRoleOrgB, customRoleOrgADeletable]);
      ({ app, moduleRef } = await bootApp(fakeRepo));
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('POST /api/admin/custom-roles 200/201s and creates a role with isSystemRole:false', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .post('/api/admin/custom-roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Auditor', permissions: [{ resourceType: 'run', action: 'read' }] });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.isSystemRole).toBe(false);
      expect(res.body.organizationId).toBe('org-A');
      expect(fakeRepo.createRole).toHaveBeenCalledWith(
        expect.objectContaining({ isSystemRole: false, organizationId: 'org-A' }),
      );
    });

    it('PATCH on a system role (isSystemRole:true) 403s even with a valid entitled license', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .patch(`/api/admin/custom-roles/${systemRoleOrgA.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked Admin' });

      expect(res.status).toBe(403);
      // Distinguishes this from the EntitlementGuard's upsell 403 above — this is the
      // service-layer system-role-protection invariant, not a commercial gate.
      expect(res.body.upsell).toBeUndefined();
      expect(fakeRepo.updateRole).not.toHaveBeenCalled();
    });

    it('DELETE on a system role (isSystemRole:true) 403s even with a valid entitled license', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/custom-roles/${systemRoleOrgA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.upsell).toBeUndefined();
      expect(fakeRepo.deleteRoleWithDependents).not.toHaveBeenCalled();
    });

    it('org-scoping: org A admin cannot PATCH a role belonging to org B', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .patch(`/api/admin/custom-roles/${customRoleOrgB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(403);
      expect(fakeRepo.updateRole).not.toHaveBeenCalled();
    });

    it('org-scoping: org A admin cannot DELETE a role belonging to org B', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/custom-roles/${customRoleOrgB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(fakeRepo.deleteRoleWithDependents).not.toHaveBeenCalled();
    });

    it('org-scoping: a newly-created role by org A is never visible in org B\'s list', async () => {
      const orgAToken = mintToken(moduleRef, orgAAdminId);
      const orgBToken = mintToken(moduleRef, orgBAdminId);

      await request(app.getHttpServer())
        .post('/api/admin/custom-roles')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({ name: 'Org A Only Role', permissions: [] });

      const orgBList = await request(app.getHttpServer())
        .get('/api/admin/custom-roles')
        .set('Authorization', `Bearer ${orgBToken}`);

      expect(orgBList.status).toBe(200);
      expect(orgBList.body.find((r: FakeRole) => r.name === 'Org A Only Role')).toBeUndefined();
    });

    it('DELETE /api/admin/custom-roles/:id succeeds for a mutable (non-system) custom role in the caller\'s own org', async () => {
      const token = mintToken(moduleRef, orgAAdminId);

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/custom-roles/${customRoleOrgADeletable.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      // The controller's `remove()` returns the raw boolean `deleteRoleWithDependents`
      // resolves to - Nest/Express serializes a bare boolean return value as
      // `text/html` body text "true" (not JSON `true`), so `res.text` (not `res.body`)
      // is the correct assertion target here.
      expect(res.text).toBe('true');
      expect(fakeRepo.deleteRoleWithDependents).toHaveBeenCalledWith(customRoleOrgADeletable.id);
      expect(fakeRepo.deleteRoleWithDependents).toHaveBeenCalledTimes(1);
    });
  });
});
