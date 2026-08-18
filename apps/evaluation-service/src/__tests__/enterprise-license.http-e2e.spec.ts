/**
 * Genuine end-to-end HTTP integration test proving the FULL stack actually integrates: real HTTP
 * (supertest) -> real JwtAuthGuard verifying a real signed JWT (not an overridden/stubbed guard)
 * -> real PrDecorationController (`@evalops/ee-pr-decoration`, EE-gated path) / real
 * RunsController + SimulationsController (free paths) -> real EntitlementGuard -> real
 * EntitlementService/LicenseVerifierService -> real RunsService/RunsRepository, all backed by a
 * real, throwaway, migration-replayed Postgres database. Mirrors
 * `apps/core-service/src/__tests__/enterprise-license.http-e2e.spec.ts` (Task 7.2)'s exact
 * structure for `evaluation-service` instead of `core-service`.
 *
 * The NestJS module graph booted here is a real subset of the production AppModule
 * (`apps/evaluation-service/src/app/app.module.ts`): `ConfigModule.forRoot`, `PassportModule`,
 * `SharedDbModule`, `LicenseModule.forRoot({ publicKeyPem: <ephemeral test key> })`, the real
 * `RunsModule` (free `GET /api/runs/:id`), the real `SimulationsModule` (free
 * `GET/POST /api/simulations/suites`), and `PrDecorationController`/`PrDecorationService`
 * declared directly as controller/providers -- NOT wrapped in a separate `PrDecorationModule` --
 * exactly like `AppModule` wires them (see the comment on `AppModule`'s `controllers`/`providers`
 * arrays: a `{ provide: RUN_LOOKUP, useExisting: RunsService }` binding is only resolvable by
 * consumers declared in the SAME module as that binding). `JwtStrategy` is the real
 * evaluation-service strategy, added the same way `AppModule` does (a root-level provider, not a
 * guard override).
 *
 * DATABASE_URL must be set to a real reachable Postgres server via this file's module-scope
 * assignment below, BEFORE any require() of '@evalops/shared-db' or any module that transitively
 * imports it (db.ts reads DATABASE_URL at module-load time and eagerly opens a Pool).
 * `RunsModule`, `SimulationsModule`, `PrDecorationController`/`PrDecorationService`,
 * `LicenseModule`, and `@evalops/shared-db` are therefore loaded via CommonJS require() calls
 * placed textually AFTER the DATABASE_URL assignment (ES `import` statements are hoisted above
 * this file's top-level statements and would load against the wrong/unset DATABASE_URL) --
 * mirrors `calibration.http-e2e.spec.ts`'s and `core-service`'s `enterprise-license.http-e2e.spec.ts`'s
 * dynamic-import pattern exactly. `JwtStrategy` does not transitively import '@evalops/shared-db'
 * (it only reads `JWT_SECRET` via `ConfigService` at Nest DI instantiation time, well after this
 * file's env assignments), so it uses a normal top-level `import`.
 *
 * `AIProviderService`'s constructor (reached transitively through `RunsModule` ->
 * `EvaluationModule` -> `EvaluatorsModule` -> `AIProviderModule`, and through `SimulationsModule`
 * -> `AIProviderModule` directly) eagerly builds a real OpenAI client and throws if no API key is
 * configured -- `OPENAI_API_KEY` is set to a dummy value below purely to satisfy that
 * construction; none of this file's requests ever reach `AIProviderService.generateResponse()`.
 *
 * The `runs` table IS RLS-enabled (`libs/shared-db/migrations/0003_enable_rls.sql`), but this
 * test connects as the Postgres superuser (`postgres`), which bypasses RLS entirely (per that
 * migration's own comment: "superuser already bypasses RLS") -- so a plain (non-tenant-context)
 * seed insert via the global `db` proxy is sufficient and visible to `RunsController` and
 * `PrDecorationController` without additional RLS session setup.
 */
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateKeyPairSync } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategy } from '../app/auth/jwt.strategy';

const ADMIN_DATABASE_URL =
  process.env['TEST_ADMIN_DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'evalops_evaluation_service_enterprise_license_http_e2e_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const TEST_JWT_SECRET = 'test-secret-for-evaluation-service-enterprise-license-http-e2e-tests-only';

// db.ts reads process.env['DATABASE_URL'] at module-load time -- must be set before the
// require() calls below. JwtStrategy's constructor reads JWT_SECRET at Nest DI instantiation
// time (inside beforeAll), well after this assignment, so plain top-level assignment suffices.
process.env['DATABASE_URL'] = TEST_DATABASE_URL;
process.env['JWT_SECRET'] = TEST_JWT_SECRET;
// AIProviderService's constructor eagerly builds a real OpenAI client and throws if no API key
// is configured. The key is never actually used -- no request in this file reaches
// AIProviderService.generateResponse().
process.env['OPENAI_API_KEY'] = 'test-key-not-used-generateResponse-is-never-called';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SharedDbModule, pool, db, runs } = require('@evalops/shared-db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LicenseModule, signLicenseEnvelope } = require('@evalops/licensing');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RunsModule } = require('../app/runs/runs.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RunsService } = require('../app/runs/runs.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SimulationsModule } = require('../app/simulations/simulations.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrDecorationController, PrDecorationService, RUN_LOOKUP } = require('@evalops/ee-pr-decoration');

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

function signPrDecorationLicense(features: string[]): string {
  return signLicenseEnvelope(
    {
      licenseId: 'lic-evaluation-service-e2e-001',
      orgName: 'Evaluation Service E2E Test Org',
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
      RunsModule,
      SimulationsModule,
    ],
    // PrDecorationController/PrDecorationService are declared directly here (not wrapped in the
    // library's own PrDecorationModule), mirroring the real AppModule's wiring exactly -- see the
    // file header comment.
    controllers: [PrDecorationController],
    providers: [
      JwtStrategy,
      PrDecorationService,
      { provide: RUN_LOOKUP, useExisting: RunsService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

const ORG_ID = 'org-evaluation-service-e2e';
const SEEDED_RUN = {
  id: 'run-e2e-seed-1',
  name: 'E2E Seed Run',
  evalSpecId: 'eval-spec-e2e-1',
  status: 'completed',
  decision: 'pass',
  triggeredBy: 'user-seed',
  organizationId: ORG_ID,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
};

describe('evaluation-service enterprise-license HTTP end-to-end (real Postgres, real JwtAuthGuard, real EntitlementGuard)', () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    await resetAndMigrateTestDatabase();
    await db.insert(runs).values(SEEDED_RUN);
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

    it('POST /api/evaluation/pr-decoration (gated path) returns 403 with the Enterprise upsell body for a real existing run', async () => {
      const token = mintToken({
        sub: 'user-no-license-pr-decoration',
        email: 'pr-decoration@org-evaluation-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/pr-decoration')
        .set('Authorization', `Bearer ${token}`)
        .send({ runId: SEEDED_RUN.id })
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.upsell).toBe(true);
      expect(res.body.feature).toBe('pr-decoration');
    });

    it('GET /api/simulations/suites and POST /api/simulations/suites (free path) remain unaffected by no license, returning real created content', async () => {
      const token = mintToken({
        sub: 'user-no-license-suites',
        email: 'suites@org-evaluation-service-e2e.test',
        organizationId: ORG_ID,
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/simulations/suites')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Free Path Suite', version: '1.0.0' })
        .expect(HttpStatus.CREATED);
      expect(createRes.body).toMatchObject({ name: 'Free Path Suite', version: '1.0.0', organizationId: ORG_ID });

      const listRes = await request(app.getHttpServer())
        .get('/api/simulations/suites')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0]).toMatchObject({ id: createRes.body.id, name: 'Free Path Suite' });
    });

    it('GET /api/runs/:id (CI-gate-relevant, free path) returns 200 with the real seeded run, unaffected by no license', async () => {
      const token = mintToken({
        sub: 'user-no-license-runs',
        email: 'runs@org-evaluation-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/runs/${SEEDED_RUN.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.body).toMatchObject({
        id: SEEDED_RUN.id,
        name: SEEDED_RUN.name,
        status: SEEDED_RUN.status,
        decision: SEEDED_RUN.decision,
        organizationId: ORG_ID,
      });
    });
  });

  describe('Enterprise license entitled for ["pr-decoration"] configured', () => {
    let app: INestApplication;
    let priorLicenseKey: string | undefined;

    beforeAll(async () => {
      priorLicenseKey = process.env['EVALOPS_LICENSE_KEY'];
      process.env['EVALOPS_LICENSE_KEY'] = signPrDecorationLicense(['pr-decoration']);
      app = await bootApp();
    });

    afterAll(async () => {
      await app.close();
      if (priorLicenseKey === undefined) delete process.env['EVALOPS_LICENSE_KEY'];
      else process.env['EVALOPS_LICENSE_KEY'] = priorLicenseKey;
    });

    it('POST /api/evaluation/pr-decoration with a valid runId returns 200 (positive control: EntitlementGuard genuinely clears)', async () => {
      const token = mintToken({
        sub: 'user-entitled-pr-decoration-valid',
        email: 'entitled-valid@org-evaluation-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/pr-decoration')
        .set('Authorization', `Bearer ${token}`)
        .send({ runId: SEEDED_RUN.id })
        .expect(HttpStatus.CREATED);

      expect(res.body).toMatchObject({
        entitled: true,
        scenarios: [{ name: SEEDED_RUN.name, decision: SEEDED_RUN.decision }],
      });
    });

    it('POST /api/evaluation/pr-decoration with an empty body {} (no runId) returns 400 class-validator rejection, not 500/200 -- proves @UsePipes(new ValidationPipe(...)) on PrDecorationController is really wired into the HTTP pipeline (closes Task 6.1 blocking gap)', async () => {
      const token = mintToken({
        sub: 'user-entitled-pr-decoration-empty-body',
        email: 'entitled-empty@org-evaluation-service-e2e.test',
        organizationId: ORG_ID,
      });

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/pr-decoration')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.statusCode).toBe(400);
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(
        (res.body.message as string[]).some((m) => m.toLowerCase().includes('runid')),
      ).toBe(true);
    });
  });
});
