/**
 * Proves two things with the REAL `AuthModule` + REAL HTTP requests (supertest), no
 * hand-reconstructed providers/controllers:
 *
 *  1. The free JWT+PAT login path (POST /api/auth/login, GET /api/auth/user) is completely
 *     unaffected by the presence of @evalops/licensing / @evalops/ee-sso in AuthModule, when
 *     NO Enterprise license (EVALOPS_LICENSE_KEY) is configured.
 *  2. The relocated, entitlement-gated SSO routes (GET /auth/microsoft[/callback]) correctly
 *     403 with the Enterprise upsell body when no license is configured — proving
 *     EntitlementGuard actually gates them post-relocation.
 *
 * This test imports the REAL `AuthModule` (mirroring
 * `apps/auth-service/src/app/admin/admin-rbac.e2e.spec.ts`'s established pattern of testing
 * against the real module graph, not a hand-reconstructed `TestingModule`) so it can actually
 * detect a real `AuthModule` wiring regression — e.g. `SSO_USER_PROVISIONER` no longer bound,
 * or `MicrosoftAuthController` dropped from `controllers:`. Only `AuthService` is overridden
 * (via `overrideProvider`, which replaces the provider across the whole compiled module graph,
 * not just at the root) so no real Postgres/SQLite-backed `UsersRepository`/
 * `OrganizationsRepository` query is ever needed.
 *
 * `EVALOPS_DEV_MODE` / `EVALOPS_DEV_DB_PATH` / `JWT_SECRET` must be set BEFORE
 * `@evalops/shared-db` (and anything that transitively imports it, like the real `AuthModule`)
 * is first required — `db.ts` reads these at module-load time. That is why the AuthModule/
 * AuthService/SharedDbModule/LicenseModule imports below are deferred `require()` calls,
 * executed only after these env vars are set (mirrors `admin-rbac.e2e.spec.ts`'s convention).
 */
import { HttpStatus } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env['EVALOPS_DEV_MODE'] = '1';
const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-no-license-free-login-'));
process.env['EVALOPS_DEV_DB_PATH'] = join(tmpDir, 'test.db');

const TEST_JWT_SECRET = 'test-secret-for-no-license-integration-tests-only';
process.env['JWT_SECRET'] = TEST_JWT_SECRET;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Test } = require('@nestjs/testing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthModule } = require('../app/auth/auth.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthService } = require('../app/auth/auth.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SharedDbModule } = require('@evalops/shared-db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LicenseModule } = require('@evalops/licensing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ConfigModule } = require('@nestjs/config');

import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

const { publicKey } = generateKeyPairSync('ed25519');
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const mockUser = {
  id: 'user-001',
  email: 'test@example.com',
  role: 'member',
  organizationId: 'org-001',
};

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn().mockResolvedValue({ access_token: 'jwt-token' }),
  validateUser: jest.fn().mockResolvedValue(mockUser),
  validateJwtPayload: jest.fn().mockResolvedValue(mockUser),
  findUserByEmail: jest.fn(),
  createUserFromMicrosoft: jest.fn(),
  updateUserFromMicrosoft: jest.fn(),
};

describe('No Enterprise license configured (integration, real AuthModule)', () => {
  let app: INestApplication;
  let priorLicenseKey: string | undefined;

  beforeAll(async () => {
    // HIGH-2 fix: LicenseModule.forRoot() does its own `imports: [ConfigModule]` — the real,
    // @Global() `ConfigModule` — so EntitlementService's ConfigService is resolved from THAT
    // module graph, not from any root-level TestingModule provider override (module-scoped DI:
    // a root override does not shadow a dependency resolved inside an imported dynamic
    // submodule's own graph). Make the "no license configured" precondition deterministic by
    // controlling the real env var directly, regardless of ambient shell/CI state.
    priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
    delete process.env['EVALOPS_LICENSE_KEY'];

    const moduleRef: TestingModule = await Test.createTestingModule({
      // ConfigModule.forRoot({ isGlobal: true }) mirrors the real AppModule's own wiring — it
      // is what actually makes ConfigHostModule's ConfigService globally resolvable across the
      // whole graph (including AuthModule's JwtStrategy, which injects ConfigService directly).
      // LicenseModule.forRoot()'s own internal `imports: [ConfigModule]` alone is NOT enough:
      // that bare (non-forRoot) import only wires ConfigService for LicenseModule's own
      // providers, it does not itself globalize ConfigModule for the rest of the graph.
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        SharedDbModule,
        LicenseModule.forRoot({ publicKeyPem: testPublicKeyPem }),
        AuthModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpDir, { recursive: true, force: true });
    if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
    else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/auth/login still works with no Enterprise license configured', async () => {
    mockAuthService.validateUser.mockResolvedValueOnce(mockUser);
    mockAuthService.login.mockResolvedValueOnce({ access_token: 'jwt-token' });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123!' })
      .expect(HttpStatus.CREATED);

    expect(res.body.access_token).toBe('jwt-token');
  });

  it('GET /api/auth/user still works with no Enterprise license configured', async () => {
    mockAuthService.validateJwtPayload.mockResolvedValueOnce(mockUser);
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = new JwtService({ secret: TEST_JWT_SECRET });
    const validToken = jwtService.sign({ sub: mockUser.id, email: mockUser.email });

    const res = await request(app.getHttpServer())
      .get('/api/auth/user')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(HttpStatus.OK);

    expect(res.body.id).toBe(mockUser.id);
    expect(res.body.email).toBe(mockUser.email);
  });

  it('GET /auth/microsoft returns 403 with the Enterprise upsell body', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/microsoft');
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.upsell).toBe(true);
    expect(res.body.feature).toBe('sso');
  });

  it('GET /auth/microsoft/callback returns 403 with the Enterprise upsell body', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/microsoft/callback?code=abc');
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.upsell).toBe(true);
    expect(res.body.feature).toBe('sso');
  });
});
