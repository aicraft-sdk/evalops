/**
 * Real end-to-end proof that `GET /api/audit-trail/export` is rate-limited.
 *
 * Before this fix, `AuditExportModule` applied no `RateLimitGuard`: the only cap was
 * `@Max(5000)` on the `?limit` query param, which bounds row count per request but not
 * how many *requests* can be fired. `AuditRepository.findEnhancedByOrg` fires one extra
 * query per row (N+1) and every request holds a connection from the globally-shared,
 * default-max-10 pg pool (`libs/shared-db/src/lib/db.ts`) for the request's full
 * duration — a handful of concurrent requests to this endpoint could exhaust the
 * platform's entire DB connection pool, denying DB access to every org. This proves
 * rapid repeated calls beyond the configured limit are rejected with 429, using the
 * same `RateLimitGuard`/`@RateLimit` convention already established for org creation
 * (`apps/auth-service/.../organizations.controller.ts`) and SDK ingestion
 * (`apps/evaluation-service/.../ingestion.controller.ts`), backed by the in-memory
 * Redis facade `RedisModule` provides automatically under `EVALOPS_DEV_MODE=1`.
 *
 * Isolated env vars / DB / license keypair / JWT secret (own tmpDir) so this spec's
 * rapid-fire requests cannot be affected by, or affect, the other audit-export
 * integration spec's in-memory rate-limit counters.
 *
 * `EVALOPS_DEV_MODE` / `EVALOPS_DEV_DB_PATH` / `JWT_SECRET` must be set BEFORE
 * `@evalops/shared-db` (and anything that transitively imports it) is first required —
 * `db.ts` reads these at module-load time. Mirrors
 * `apps/core-service/src/__tests__/audit-export-entitlement.integration.test.ts`'s
 * established convention of deferred `require()` calls for this reason.
 */
import { HttpStatus } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env['EVALOPS_DEV_MODE'] = '1';
const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-audit-export-rate-limit-'));
process.env['EVALOPS_DEV_DB_PATH'] = join(tmpDir, 'test.db');

const TEST_JWT_SECRET = 'test-secret-for-audit-export-rate-limit-tests-only';
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

function signUserJwt(organizationId: string, sub: string): string {
  return jwtService.sign({ sub, email: `${sub}@example.com`, organizationId, roles: ['member'] });
}

function signAuditExportLicense(): string {
  return signLicenseEnvelope(
    {
      licenseId: 'lic-rate-limit-001',
      orgName: 'Test Enterprise Org',
      features: ['audit-export'],
      issuedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    },
    testPrivateKeyPem,
  );
}

function buildMockAuditRepository() {
  return {
    findEnhancedByOrg: jest.fn(() => Promise.resolve([])),
  };
}

describe('GET /audit-trail/export rate limiting (real HTTP + real Nest boot)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let priorLicenseKey: string | undefined;

  beforeAll(async () => {
    priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
    process.env['EVALOPS_LICENSE_KEY'] = signAuditExportLicense();

    moduleRef = await Test.createTestingModule(auditExportTestAppModuleMetadata(testPublicKeyPem))
      .overrideProvider(AuditRepository)
      .useValue(buildMockAuditRepository())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
    else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows requests within the configured limit, rejects the request that exceeds it with 429, and scopes the limit per-user', async () => {
    const orgAToken = signUserJwt('org-A', 'user-rate-limit-a');

    // The route's configured limit is 5 requests/60s (see @RateLimit on
    // AuditExportController.export). Fire 6 rapid requests from the SAME user:
    // the first 5 must succeed, the 6th must be rejected with 429.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .get('/api/audit-trail/export')
        .set('Authorization', `Bearer ${orgAToken}`);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(HttpStatus.TOO_MANY_REQUESTS);

    // Scoping: a DIFFERENT user must not be affected by org-A user's exhausted
    // limit — RateLimitGuard keys by request.user.id, not globally, so this must
    // still succeed even though the shared endpoint is currently rate-limited for
    // the first user.
    const orgBToken = signUserJwt('org-B', 'user-rate-limit-b');
    const otherUserRes = await request(app.getHttpServer())
      .get('/api/audit-trail/export')
      .set('Authorization', `Bearer ${orgBToken}`);
    expect(otherUserRes.status).toBe(HttpStatus.OK);
  });
});
