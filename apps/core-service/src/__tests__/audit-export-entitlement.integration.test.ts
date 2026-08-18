/**
 * Proves, with a real HTTP-driven boot of the real `CoreAnalyticsModule` (free audit-trail
 * view) + `AuditExportModule` (gated export) + `LicenseModule` + real `JwtAuthGuard`/
 * `JwtStrategy`, no hand-reconstructed controllers:
 *
 *  1. The free, pre-existing `GET /api/audit-trail` path (`AuditController`, unchanged by
 *     this phase) is unaffected — still 200s with no Enterprise license configured.
 *  2. `GET /api/audit-trail/export` (new) 403s with the Enterprise upsell body when no
 *     license is configured, and 200s (real CSV body) when a validly-signed license
 *     entitled to `audit-export` is configured — proving `EntitlementGuard` actually gates
 *     the route post-wiring, not just in the service-level unit test.
 *  3. Org-scoping: a user whose JWT carries org A's `organizationId` can never receive org
 *     B's audit rows in the exported CSV, and a client-supplied `organizationId` query
 *     param is ignored entirely (mirrors the documented `POST /policies/evaluate/:runId`
 *     cross-tenant IDOR class this repo has previously shipped — the export endpoint must
 *     not repeat it).
 *  4. CSV formula-injection characters in a real audit-trail field value (`userName`) are
 *     safely escaped end-to-end through the real HTTP response body, not just at the
 *     service-unit level.
 *
 * `EVALOPS_DEV_MODE` / `EVALOPS_DEV_DB_PATH` / `JWT_SECRET` must be set BEFORE
 * `@evalops/shared-db` (and anything that transitively imports it) is first required —
 * `db.ts` reads these at module-load time. Mirrors
 * `apps/auth-service/src/__tests__/no-license-free-login.integration.test.ts`'s established
 * convention of deferred `require()` calls for this reason.
 */
import { HttpStatus } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env['EVALOPS_DEV_MODE'] = '1';
const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-audit-export-entitlement-'));
process.env['EVALOPS_DEV_DB_PATH'] = join(tmpDir, 'test.db');

const TEST_JWT_SECRET = 'test-secret-for-audit-export-integration-tests-only';
process.env['JWT_SECRET'] = TEST_JWT_SECRET;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Test } = require('@nestjs/testing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuditRepository } = require('@evalops/shared-db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signLicenseEnvelope } = require('@evalops/licensing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { auditExportTestAppModuleMetadata } = require('./support/audit-export-test-app.imports');

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const testPrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const jwtService = new JwtService({ secret: TEST_JWT_SECRET });

function signUserJwt(organizationId: string, sub = `user-${organizationId}`): string {
  return jwtService.sign({ sub, email: `${sub}@example.com`, organizationId, roles: ['member'] });
}

function signAuditExportLicense(features: string[]): string {
  return signLicenseEnvelope(
    {
      licenseId: 'lic-001',
      orgName: 'Test Enterprise Org',
      features,
      issuedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    },
    testPrivateKeyPem,
  );
}

const ORG_A_ENTRIES = [
  {
    id: 'a1',
    action: 'update',
    entityType: 'prompt',
    entityId: 'p-a1',
    changes: {},
    organizationId: 'org-A',
    userId: 'user-org-A',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    userName: 'alice@org-a.example.com',
    userFirstName: 'Alice',
    userLastName: 'A',
  },
];

const ORG_B_ENTRIES = [
  {
    id: 'b1',
    action: 'delete',
    entityType: 'dataset',
    entityId: 'd-b1',
    changes: {},
    organizationId: 'org-B',
    userId: 'user-org-B',
    createdAt: new Date('2026-02-02T00:00:00.000Z'),
    userName: 'bob@org-b.example.com',
    userFirstName: 'Bob',
    userLastName: 'B',
  },
];

function buildMockAuditRepository() {
  return {
    findEnhancedByOrg: jest.fn((organizationId: string) => {
      if (organizationId === 'org-A') return Promise.resolve(ORG_A_ENTRIES);
      if (organizationId === 'org-B') return Promise.resolve(ORG_B_ENTRIES);
      return Promise.resolve([]);
    }),
  };
}

async function bootApp(mockAuditRepository: ReturnType<typeof buildMockAuditRepository>): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule(
    auditExportTestAppModuleMetadata(testPublicKeyPem),
  )
    .overrideProvider(AuditRepository)
    .useValue(mockAuditRepository)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('audit-export entitlement + org-scoping + CSV injection (integration, real HTTP)', () => {
  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('No Enterprise license configured', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;
    let mockAuditRepository: ReturnType<typeof buildMockAuditRepository>;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      delete process.env['EVALOPS_LICENSE_KEY'];
      mockAuditRepository = buildMockAuditRepository();
      app = await bootApp(mockAuditRepository);
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('GET /api/audit-trail (free, unchanged) still 200s with no Enterprise license configured', async () => {
      const token = signUserJwt('org-A');
      const res = await request(app.getHttpServer())
        .get('/api/audit-trail')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual(ORG_A_ENTRIES.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })));
    });

    it('GET /api/audit-trail/export 403s with the Enterprise upsell body', async () => {
      const token = signUserJwt('org-A');
      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.upsell).toBe(true);
      expect(res.body.feature).toBe('audit-export');
    });
  });

  describe('Valid audit-export-entitled Enterprise license configured', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;
    let mockAuditRepository: ReturnType<typeof buildMockAuditRepository>;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      process.env['EVALOPS_LICENSE_KEY'] = signAuditExportLicense(['audit-export']);
      mockAuditRepository = buildMockAuditRepository();
      app = await bootApp(mockAuditRepository);
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    beforeEach(() => {
      mockAuditRepository.findEnhancedByOrg.mockClear();
    });

    it('GET /api/audit-trail/export 200s and returns a real CSV body for an entitled license', async () => {
      // Each `it` below signs a distinct JWT `sub` so its request(s) don't share a
      // rate-limit key (RateLimitGuard keys by user id + path, 5 req/60s) with any
      // other `it` in this describe block — that shared counter belongs to
      // audit-export-rate-limit.integration.test.ts, not this entitlement/scoping/
      // CSV-escaping spec.
      const token = signUserJwt('org-A', 'user-export-basic');
      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.headers['content-type']).toContain('text/csv');
      const rows = res.text.split('\n');
      expect(rows[0]).toBe('id,action,entityType,entityId,userName,createdAt');
      expect(rows[1]).toBe('a1,update,prompt,p-a1,alice@org-a.example.com,2026-02-01T00:00:00.000Z');
    });

    it('org-scoping: a user authenticated as org A never receives org B\'s audit rows, and vice versa', async () => {
      const orgAToken = signUserJwt('org-A', 'user-export-scope-a');
      const orgBToken = signUserJwt('org-B', 'user-export-scope-b');

      const orgARes = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(HttpStatus.OK);
      const orgBRes = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${orgBToken}`)
        .expect(HttpStatus.OK);

      expect(orgARes.text).toContain('alice@org-a.example.com');
      expect(orgARes.text).not.toContain('bob@org-b.example.com');
      expect(orgBRes.text).toContain('bob@org-b.example.com');
      expect(orgBRes.text).not.toContain('alice@org-a.example.com');

      expect(mockAuditRepository.findEnhancedByOrg).toHaveBeenNthCalledWith(1, 'org-A', 1000);
      expect(mockAuditRepository.findEnhancedByOrg).toHaveBeenNthCalledWith(2, 'org-B', 1000);
    });

    it('org-scoping: a client-supplied organizationId query param cannot override the JWT-derived org', async () => {
      const orgAToken = signUserJwt('org-A', 'user-export-override');

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export?organizationId=org-B')
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(HttpStatus.OK);

      expect(res.text).toContain('alice@org-a.example.com');
      expect(res.text).not.toContain('bob@org-b.example.com');
      expect(mockAuditRepository.findEnhancedByOrg).toHaveBeenCalledWith('org-A', 1000);
    });

    it('rejects an out-of-range ?limit with a validated 400, not a raw DB-error 500', async () => {
      const token = signUserJwt('org-A', 'user-export-badlimit-range');

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export?limit=99999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.statusCode).toBe(400);
      expect(mockAuditRepository.findEnhancedByOrg).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric ?limit with a validated 400', async () => {
      const token = signUserJwt('org-A', 'user-export-badlimit-nan');

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export?limit=not-a-number')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.statusCode).toBe(400);
      expect(mockAuditRepository.findEnhancedByOrg).not.toHaveBeenCalled();
    });

    it('rejects a negative ?limit with a validated 400', async () => {
      const token = signUserJwt('org-A', 'user-export-badlimit-neg');

      await request(app.getHttpServer())
        .get('/api/audit-trail/export?limit=-5')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.BAD_REQUEST);

      expect(mockAuditRepository.findEnhancedByOrg).not.toHaveBeenCalled();
    });

    it('accepts a valid in-range ?limit and forwards it to AuditRepository.findEnhancedByOrg', async () => {
      const token = signUserJwt('org-A', 'user-export-goodlimit');

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export?limit=250')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(mockAuditRepository.findEnhancedByOrg).toHaveBeenCalledWith('org-A', 250);
    });

    it('CSV formula-injection characters in a real audit-trail field are escaped end-to-end in the HTTP response body', async () => {
      mockAuditRepository.findEnhancedByOrg.mockResolvedValueOnce([
        {
          id: 'a2',
          action: 'update',
          entityType: 'prompt',
          entityId: 'p-a2',
          changes: {},
          organizationId: 'org-A',
          userId: 'user-org-A',
          createdAt: new Date('2026-02-03T00:00:00.000Z'),
          userName: "=cmd|' /C calc'!A1",
          userFirstName: null,
          userLastName: null,
        },
      ]);
      const token = signUserJwt('org-A', 'user-export-csv-injection');

      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      const dataRow = res.text.split('\n')[1];
      expect(dataRow).not.toMatch(/,=cmd\|/);
      expect(dataRow).toContain("'=cmd|' /C calc'!A1");
    });
  });
});
