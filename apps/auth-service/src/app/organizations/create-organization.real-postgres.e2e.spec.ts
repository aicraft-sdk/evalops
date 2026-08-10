/**
 * Real end-to-end proof of the self-service create-organization flow through
 * the ACTUAL production pipeline: real JwtStrategy -> real JwtAuthGuard ->
 * real OrgContextInterceptor -> real db.ts `set_config` -> real Postgres RLS
 * check on the `organization_members` INSERT policy.
 *
 * This is deliberately NOT the SQLite dev-mode variant
 * (`create-organization.e2e.spec.ts`), which never enforces RLS at all and
 * therefore cannot catch a bug in how `request.user` is read for
 * `set_config('app.user_id', ...)`.
 *
 * Requires a real, disposable Postgres instance with migrations 0000-0005
 * applied and a NON-superuser, NOBYPASSRLS application role for the app
 * itself — connecting the APP as a superuser (or any BYPASSRLS role) would
 * silently skip RLS enforcement and defeat the point of this test. Configure
 * via env vars:
 *   REAL_PG_URL        - connection string for the NOBYPASSRLS app role;
 *                         this is what the app under test connects with.
 *   REAL_PG_VERIFY_URL - connection string for seeding/verification only
 *                         (may be a superuser/BYPASSRLS role — this pool
 *                         never exercises the code under test, it only
 *                         seeds fixtures and independently reads back the
 *                         row the app wrote, which RLS would otherwise hide
 *                         from a session with no app.org_id/app.user_id
 *                         set). Defaults to REAL_PG_URL if unset.
 *
 * Skips itself (rather than failing) when REAL_PG_URL is not set, so normal
 * CI/local runs of the full test suite are not broken by the lack of a live
 * Postgres instance.
 */
import { randomUUID } from 'crypto';

const REAL_PG_URL = process.env['REAL_PG_URL'];
const REAL_PG_VERIFY_URL = process.env['REAL_PG_VERIFY_URL'] ?? REAL_PG_URL;
const describeOrSkip = REAL_PG_URL ? describe : describe.skip;

describeOrSkip('Self-service create-organization (real HTTP + real Postgres + real RLS)', () => {
  process.env['DATABASE_URL'] = REAL_PG_URL;
  process.env['JWT_SECRET'] = 'test-secret-create-organization-real-pg-e2e';
  delete process.env['EVALOPS_DEV_MODE'];

  const seededUserId = randomUUID();
  const seededEmail = `newco-founder-${seededUserId}@example.com`;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Test } = require('@nestjs/testing');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const request = require('supertest');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ValidationPipe } = require('@nestjs/common');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JwtService } = require('@nestjs/jwt');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../app.module');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let moduleRef: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let verifyPool: any;

  beforeAll(async () => {
    verifyPool = new Pool({ connectionString: REAL_PG_VERIFY_URL });

    const now = new Date();
    await verifyPool.query(
      `INSERT INTO organizations (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      ['default-org', 'Default Organization', now, now],
    );
    await verifyPool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, organization_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'viewer', 'default-org', true, $6, $6)`,
      [seededUserId, seededEmail, 'unused-not-logging-in-with-password', 'Nora', 'Newco', now],
    );

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await verifyPool.query('DELETE FROM organization_members WHERE user_id = $1', [seededUserId]);
    await verifyPool.query('DELETE FROM users WHERE id = $1', [seededUserId]);
    await verifyPool.end();
  });

  it('lets a viewer-role registrant create a new org and become its ORG_ADMIN via a real Postgres RLS-checked INSERT', async () => {
    const jwtService = moduleRef.get(JwtService);
    const token: string = jwtService.sign({
      sub: seededUserId,
      email: seededEmail,
      organizationId: 'default-org',
      roles: ['viewer'],
    });

    // Real HTTP request through the real pipeline: JwtAuthGuard -> JwtStrategy
    // (returns { id: ... }, matching AuthenticatedUser) -> OrgContextInterceptor
    // (must read request.user.id, not .sub/.userId) -> set_config('app.user_id', ...)
    // -> OrganizationsRepository.createWithAdminMember -> real RLS check on
    // the organization_members INSERT policy.
    const createRes = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Newco Inc' })
      .expect(201);

    const newOrgId: string = createRes.body.id;
    expect(createRes.body.name).toBe('Newco Inc');
    expect(newOrgId).toBeTruthy();
    expect(newOrgId).not.toBe('default-org');

    // Verify via a REAL, independent Postgres read (not the app's own repo)
    // that the membership row genuinely landed in the database.
    const { rows } = await verifyPool.query(
      'SELECT organization_id, user_id, role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [newOrgId, seededUserId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: newOrgId,
      user_id: seededUserId,
      role: 'org_admin',
    });

    await verifyPool.query('DELETE FROM organization_members WHERE organization_id = $1', [newOrgId]);
    await verifyPool.query('DELETE FROM organizations WHERE id = $1', [newOrgId]);
  });
});
