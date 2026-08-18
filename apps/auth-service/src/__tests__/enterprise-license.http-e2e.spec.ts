/**
 * Genuine end-to-end HTTP integration test proving the FULL auth-service stack actually
 * integrates: real HTTP (supertest) -> real `LocalAuthGuard`/`JwtAuthGuard` verifying a real
 * bcrypt-hashed password / a real signed JWT (not overridden/stubbed guards) -> real
 * `AuthController`/`AuthService` -> real `UsersRepository`/`OrganizationsRepository` ->
 * real `MicrosoftAuthController` (`@evalops/ee-sso`) and real `CustomRolesController`
 * (`@evalops/ee-rbac-custom-roles`) -> real `EntitlementGuard`/`EntitlementService`
 * (`@evalops/licensing`), all backed by a real, throwaway, migration-replayed Postgres
 * database (not dev-mode SQLite — `roles`/`role_permissions`/`permissions` are Postgres-only
 * tables, a documented project pattern). No layer of the license/entitlement/RBAC/auth chain
 * under test is mocked.
 *
 * Two pre-existing sibling tests intentionally stop short of this: `no-license-free-login.
 * integration.test.ts` mocks `AuthService` entirely (dev-mode SQLite) and
 * `custom-roles-entitlement.integration.test.ts` fakes `PermissionsRepository` (dev-mode
 * SQLite, since the permissions tables aren't mirrored there). THIS file is the genuine
 * real-Postgres, real-register/real-login, unmocked complement Task 7.1 asks for — it also
 * doubles as regression coverage that `signLicenseEnvelope` (`@evalops/licensing`) and
 * `LicenseVerifierService`'s parsing stay in sync, since the test license envelope below is
 * built via the REAL signing util, signed with the SAME ephemeral Ed25519 key used to
 * construct `LicenseModule.forRoot({ publicKeyPem })`'s override — not a re-implemented
 * ad-hoc inline signer.
 *
 * The NestJS module graph booted here is a real subset of the production `AppModule`
 * (`apps/auth-service/src/app/app.module.ts`): `ConfigModule.forRoot`, `PassportModule`,
 * `JwtModule`, `SharedDbModule`, `LicenseModule.forRoot({ publicKeyPem: <ephemeral test key>
 * })`, and the real `AuthModule` (which itself imports the real `MicrosoftAuthController` via
 * `@evalops/ee-sso`) — not a hand-assembled provider list. `PermissionsModule` is additionally
 * included because that is the real module that imports `CustomRolesModule`
 * (`@evalops/ee-rbac-custom-roles`) in production (see `apps/auth-service/src/app/permissions/
 * permissions.module.ts`) — required to reach `POST /api/admin/custom-roles` for Scenario B,
 * exactly mirroring the production wiring rather than importing `CustomRolesModule` directly.
 *
 * `EntitlementService.onModuleInit()` reads `EVALOPS_LICENSE_KEY` ONCE at Nest module
 * bootstrap and caches a "no license configured" (`bootStatus: 'none'`) result for the
 * lifetime of that module instance (see `libs/licensing/src/lib/entitlement.service.ts`) — so
 * Scenario A (no license) and Scenario B (an audit-export-only license) each boot their OWN
 * `INestApplication` from a fresh `EVALOPS_LICENSE_KEY` env value, rather than sharing one app
 * and mutating the env var mid-suite (which would have no effect on an already-booted
 * `EntitlementService`).
 *
 * DATABASE_URL must be set to a real reachable Postgres server via this file's module-scope
 * assignment below, BEFORE any require() of '@evalops/shared-db' or any module that
 * transitively imports it (db.ts reads DATABASE_URL at module-load time and eagerly opens a
 * Pool). `AuthModule`/`PermissionsModule`/`@evalops/shared-db`/`@evalops/licensing` are
 * therefore loaded via CommonJS require() calls placed textually AFTER the DATABASE_URL
 * assignment (ES `import` statements are hoisted above this file's top-level statements and
 * would load against the wrong/unset DATABASE_URL) — mirrors `calibration.http-e2e.spec.ts`'s
 * dynamic-import pattern and `admin-rbac.e2e.spec.ts`'s require()-after-env-setup pattern
 * exactly. Everything else here (`pg`, `supertest`, `@nestjs/*` packages, `crypto`) does not
 * transitively import '@evalops/shared-db', so those use normal top-level `import`.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateKeyPairSync } from 'crypto';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_enterprise_license_http_e2e_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const TEST_JWT_SECRET = 'test-secret-for-enterprise-license-http-e2e-tests-only';

// db.ts reads process.env['DATABASE_URL'] at module-load time -- must be set before the
// require() calls below. JwtStrategy's constructor reads JWT_SECRET at Nest DI instantiation
// time (inside beforeAll), well after this assignment, so plain top-level assignment suffices.
process.env['DATABASE_URL'] = TEST_DATABASE_URL;
process.env['JWT_SECRET'] = TEST_JWT_SECRET;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthModule } = require('../app/auth/auth.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PermissionsModule } = require('../app/permissions/permissions.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SharedDbModule, pool } = require('@evalops/shared-db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LicenseModule, signLicenseEnvelope } = require('@evalops/licensing');

async function resetAndMigrateTestDatabase(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }

  const target = new Client({ connectionString: TEST_DATABASE_URL });
  await target.connect();
  try {
    const migrationsDir = join(__dirname, '../../../../libs/shared-db/migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sqlText = readFileSync(join(migrationsDir, file), 'utf-8');
      if (sqlText.includes('--> statement-breakpoint')) {
        for (const statement of sqlText.split('--> statement-breakpoint')) {
          const trimmed = statement.trim();
          if (trimmed) {
            await target.query(trimmed);
          }
        }
      } else if (sqlText.trim()) {
        await target.query(sqlText);
      }
    }
  } finally {
    await target.end();
  }
}

/** Directly promotes a user's role to 'admin' via raw SQL, bypassing the (chicken-and-egg,
 * no self-service) admin-promotion flow -- needed so Scenario B's `POST /api/admin/
 * custom-roles` call genuinely clears `RbacGuard` and reaches `EntitlementGuard`, proving the
 * 403 is really the Enterprise entitlement gate and not just an unrelated role rejection.
 * `JwtStrategy.validate()` re-fetches the user from the DB on every request and derives
 * `request.user.roles` from that fresh row (not from the JWT's embedded claims), so the
 * already-issued access token from registration remains valid to use after this promotion. */
async function promoteUserToAdmin(email: string): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email]);
  } finally {
    await client.end();
  }
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const testPrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function signLicense(features: string[]): string {
  return signLicenseEnvelope(
    {
      licenseId: 'lic-enterprise-license-http-e2e',
      orgName: 'Test Enterprise Org',
      features,
      issuedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    },
    testPrivateKeyPem,
  );
}

async function bootApp(): Promise<{ app: INestApplication; moduleRef: TestingModule }> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PassportModule,
      JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '24h' } }),
      SharedDbModule,
      LicenseModule.forRoot({ publicKeyPem: testPublicKeyPem }),
      AuthModule,
      PermissionsModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Mirrors apps/auth-service/src/main.ts's real bootstrap exactly (global prefix +
  // ValidationPipe) so DTO validation on POST /api/admin/custom-roles behaves identically to
  // production.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
  return { app, moduleRef };
}

let migrated = false;

describe('Enterprise license gating HTTP end-to-end (real Postgres, real AuthModule/PermissionsModule, real JWT)', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
    migrated = true;
  });

  afterAll(async () => {
    if (migrated) {
      await pool?.end();
    }
  });

  describe('Scenario A: no EVALOPS_LICENSE_KEY configured', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      delete process.env['EVALOPS_LICENSE_KEY'];
      ({ app } = await bootApp());
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('lets a real user register+login (free path unaffected), and 403s the SSO upsell for GET /auth/microsoft', async () => {
      const email = 'scenario-a@no-license-http-e2e.test';
      const password = 'Password123!';

      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, firstName: 'Scenario', lastName: 'A' })
        .expect(HttpStatus.CREATED);
      expect(typeof registerRes.body.access_token).toBe('string');
      expect(registerRes.body.access_token.length).toBeGreaterThan(0);
      expect(registerRes.body.user).toMatchObject({ email, role: 'viewer' });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(HttpStatus.CREATED);
      const token: string = loginRes.body.access_token;
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      // Login authenticates the SAME registered user (not a distinct/mismatched account) --
      // decode both tokens' payloads and compare the `sub` claim directly. (Register and login
      // land in the same wall-clock second here, so the tokens are byte-identical -- `iat`
      // has 1s resolution -- which is expected JWT behavior, not a meaningful thing to assert.)
      const decodePayload = (jwt: string) =>
        JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf-8'));
      expect(decodePayload(token).sub).toBe(decodePayload(registerRes.body.access_token).sub);

      const userRes = await request(app.getHttpServer())
        .get('/api/auth/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);
      expect(userRes.body).toMatchObject({ email, role: 'viewer' });
      expect(typeof userRes.body.id).toBe('string');
      expect(userRes.body.id.length).toBeGreaterThan(0);

      const ssoRes = await request(app.getHttpServer()).get('/api/auth/microsoft');
      expect(ssoRes.status).toBe(HttpStatus.FORBIDDEN);
      expect(ssoRes.body).toMatchObject({ upsell: true, feature: 'sso' });
    });
  });

  describe('Scenario B: EVALOPS_LICENSE_KEY entitled for [audit-export] only', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;
    const email = 'scenario-b@partial-license-http-e2e.test';
    const password = 'Password123!';

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      process.env['EVALOPS_LICENSE_KEY'] = signLicense(['audit-export']);
      ({ app } = await bootApp());

      // Register a real user and promote it to ADMIN via raw SQL (see promoteUserToAdmin's
      // doc comment) so POST /api/admin/custom-roles genuinely reaches EntitlementGuard.
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, firstName: 'Scenario', lastName: 'B' })
        .expect(HttpStatus.CREATED);
      await promoteUserToAdmin(email);
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('still 403s BOTH GET /auth/microsoft (sso) and POST /api/admin/custom-roles (rbac-custom-roles) -- proves gating spans both features, not just one', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(HttpStatus.CREATED);
      const adminToken: string = loginRes.body.access_token;

      const ssoRes = await request(app.getHttpServer()).get('/api/auth/microsoft');
      expect(ssoRes.status).toBe(HttpStatus.FORBIDDEN);
      expect(ssoRes.body).toMatchObject({ upsell: true, feature: 'sso' });

      const customRolesRes = await request(app.getHttpServer())
        .post('/api/admin/custom-roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Auditor', permissions: [{ resourceType: 'run', action: 'read' }] });
      expect(customRolesRes.status).toBe(HttpStatus.FORBIDDEN);
      expect(customRolesRes.body).toMatchObject({ upsell: true, feature: 'rbac-custom-roles' });

      // The two 403s carry genuinely DIFFERENT feature identifiers -- confirms this is
      // real per-feature entitlement gating (audit-export alone grants neither), not a
      // single blanket "no license" 403 that happens to fire twice.
      expect(ssoRes.body.feature).not.toBe(customRolesRes.body.feature);
    });
  });
});
