/**
 * Genuine end-to-end HTTP integration test proving the FULL stack actually integrates: real
 * HTTP (supertest) -> real JwtAuthGuard verifying a real signed JWT (not an overridden/stubbed
 * guard) -> real AuditController (free path, `@evalops/core-analytics`) / real
 * AuditExportController (gated path, `@evalops/ee-audit-export`) -> real EntitlementGuard ->
 * real EntitlementService/LicenseVerifierService -> real AuditRepository, all backed by a real,
 * throwaway, migration-replayed Postgres database. Mirrors
 * `apps/auth-service/src/__tests__/enterprise-license.http-e2e.spec.ts` (Task 7.1)'s exact
 * structure for `core-service` instead of `auth-service`.
 *
 * The NestJS module graph booted here is a real subset of the production AppModule
 * (`apps/core-service/src/app/app.module.ts`): `ConfigModule.forRoot`, `PassportModule`,
 * `SharedDbModule`, `LicenseModule.forRoot({ publicKeyPem: <ephemeral test key> })`, the real
 * `CoreAnalyticsModule` (free `GET /api/audit-trail`), and the real `AuditExportModule` (gated
 * `GET /api/audit-trail/export`) -- not a hand-assembled provider list. `JwtStrategy` is the
 * real core-service strategy, added the same way `AppModule` does (a root-level provider, not a
 * guard override).
 *
 * DATABASE_URL must be set to a real reachable Postgres server via this file's module-scope
 * assignment below, BEFORE any require() of '@evalops/shared-db' or any module that
 * transitively imports it (db.ts reads DATABASE_URL at module-load time and eagerly opens a
 * Pool). `CoreAnalyticsModule`, `AuditExportModule`, `LicenseModule`, and `@evalops/shared-db`
 * are therefore loaded via CommonJS require() calls placed textually AFTER the DATABASE_URL
 * assignment (ES `import` statements are hoisted above this file's top-level statements and
 * would load against the wrong/unset DATABASE_URL) -- mirrors
 * `calibration.http-e2e.spec.ts`'s dynamic-import pattern exactly.
 *
 * The `audit_trail` table is NOT RLS-enabled (see `libs/shared-db/migrations/0003_enable_rls.sql`
 * -- `AuditRepository` filters by `organizationId` explicitly in its WHERE clause instead), so a
 * plain (non-tenant-context) seed insert via the global `db` proxy is sufficient and visible to
 * both `AuditController` and `AuditExportController` without additional RLS session setup.
 *
 * `AuditExportModule` imports the real Redis-backed `RateLimitGuard` (`@evalops/shared-common`'s
 * `RedisModule`) -- since `EVALOPS_DEV_MODE` is deliberately NOT set here (this is the real-
 * Postgres path, not the sqlite dev-mode path), that guard talks to a real local Redis instance,
 * exactly like it would in production.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateKeyPairSync } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from '@evalops/shared-auth';
import { JwtStrategy } from '../app/jwt.strategy';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_core_service_enterprise_license_http_e2e_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const TEST_JWT_SECRET = 'test-secret-for-core-service-enterprise-license-http-e2e-tests-only';

// db.ts reads process.env['DATABASE_URL'] at module-load time -- must be set before the
// require() calls below. JwtStrategy's constructor reads JWT_SECRET at Nest DI instantiation
// time (inside beforeAll), well after this assignment, so plain top-level assignment suffices.
process.env['DATABASE_URL'] = TEST_DATABASE_URL;
process.env['JWT_SECRET'] = TEST_JWT_SECRET;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SharedDbModule, pool, db, auditTrail } = require('@evalops/shared-db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LicenseModule, signLicenseEnvelope } = require('@evalops/licensing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CoreAnalyticsModule } = require('@evalops/core-analytics');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuditExportModule } = require('@evalops/ee-audit-export');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const testPrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

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

function mintToken(payload: { sub: string; email: string; organizationId: string }): string {
  const jwtService = new JwtService({ secret: TEST_JWT_SECRET });
  return jwtService.sign({ ...payload, roles: [] });
}

function signAuditExportLicense(features: string[]): string {
  return signLicenseEnvelope(
    {
      licenseId: 'lic-core-service-e2e-001',
      orgName: 'Core Service E2E Test Org',
      features,
      issuedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    },
    testPrivateKeyPem,
  );
}

async function bootApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PassportModule,
      SharedDbModule,
      LicenseModule.forRoot({ publicKeyPem: testPublicKeyPem }),
      CoreAnalyticsModule,
      AuditExportModule,
    ],
    providers: [JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

const ORG_ID = 'org-core-service-e2e';
const SEEDED_ENTRY = {
  id: 'audit-e2e-seed-1',
  entityType: 'prompt',
  entityId: 'prompt-e2e-1',
  action: 'update',
  changes: { before: 'v1', after: 'v2' },
  userId: 'user-core-e2e-1',
  organizationId: ORG_ID,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
};

describe('core-service enterprise-license HTTP end-to-end (real Postgres, real JwtAuthGuard, real EntitlementGuard)', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
    await db.insert(auditTrail).values(SEEDED_ENTRY);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe('No Enterprise license configured (EVALOPS_LICENSE_KEY unset)', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      delete process.env['EVALOPS_LICENSE_KEY'];
      app = await bootApp();
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('GET /api/audit-trail (free path) returns 200 with the real seeded entry, unaffected by no license', async () => {
      const token = mintToken({
        sub: 'user-no-license-reader',
        email: 'reader@org-core-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: SEEDED_ENTRY.id,
        action: SEEDED_ENTRY.action,
        entityType: SEEDED_ENTRY.entityType,
        entityId: SEEDED_ENTRY.entityId,
        organizationId: ORG_ID,
      });
    });

    it('GET /api/audit-trail/export (gated path) returns 403 with the Enterprise upsell body', async () => {
      const token = mintToken({
        sub: 'user-no-license-export',
        email: 'export@org-core-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.upsell).toBe(true);
      expect(res.body.feature).toBe('audit-export');
    });
  });

  describe('Enterprise license entitled for ["audit-export"] configured', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      process.env['EVALOPS_LICENSE_KEY'] = signAuditExportLicense(['audit-export']);
      app = await bootApp();
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('GET /api/audit-trail/export returns 200 with a well-formed CSV body containing the real seeded entry', async () => {
      const token = mintToken({
        sub: 'user-entitled-export',
        email: 'entitled@org-core-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.headers['content-type']).toContain('text/csv');
      const rows = res.text.trim().split('\n');
      expect(rows[0]).toBe('id,action,entityType,entityId,userName,createdAt');
      expect(rows).toHaveLength(2);
      expect(rows[1]).toBe(
        `${SEEDED_ENTRY.id},${SEEDED_ENTRY.action},${SEEDED_ENTRY.entityType},${SEEDED_ENTRY.entityId},,${SEEDED_ENTRY.createdAt.toISOString()}`,
      );
    });
  });
});
