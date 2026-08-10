/**
 * Integration tests for the self-service Policies API.
 *
 * Tests the full path:
 *   POST   /api/policies                → RBAC (org_admin/admin only) + rule-shape validation → persisted policy
 *   PUT    /api/policies/:id            → org-scoped update (404 across orgs)
 *   DELETE /api/policies/:id            → org-scoped delete (404 across orgs)
 *   POST   /api/policies/evaluate/:runId → confirms a newly created policy's rules are
 *     actually applied against a real run (not just that the row exists).
 *
 * Uses a real NestJS module (real guards, real ValidationPipe, real JwtStrategy signature
 * verification, real PoliciesService.evaluatePolicies) with an in-memory fake RunsRepository
 * that enforces the same org-scoped WHERE-clause semantics as the real Drizzle repository
 * (see runs.repository.ts: updatePolicy/deletePolicy filter on id AND organizationId).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PoliciesController } from '../app/policies/policies.controller';
import { PoliciesService } from '../app/policies/policies.service';
import { JwtStrategy } from '../app/auth/jwt.strategy';
import { RunsRepository } from '@evalops/shared-db';
import { UserRole } from '@evalops/shared-auth';

const TEST_JWT_SECRET = 'test-secret-for-policies-integration-tests-only';

/**
 * In-memory fake mirroring RunsRepository's org-scoped policy methods.
 * Update/delete only affect rows matching BOTH id AND organizationId, exactly
 * like the real Drizzle `and(eq(policies.id, id), eq(policies.organizationId, orgId))`
 * WHERE clause — this is what proves cross-org isolation in these tests.
 */
class FakeRunsRepository implements Partial<RunsRepository> {
  private policiesStore = new Map<string, Record<string, unknown>>();
  private runsStore = new Map<string, Record<string, unknown>>();
  private violations: Record<string, unknown>[] = [];
  private seq = 0;

  seedRun(run: Record<string, unknown>) {
    this.runsStore.set(run['id'] as string, run);
  }

  async findById(id: string) {
    return this.runsStore.get(id) as never;
  }

  async findActivePolicies(organizationId: string) {
    return [...this.policiesStore.values()].filter(
      (p) => p['organizationId'] === organizationId && p['isActive'],
    ) as never;
  }

  async findActiveBaseline() {
    return undefined as never;
  }

  async createPolicyViolation(data: Record<string, unknown>) {
    const violation = { id: `viol-${++this.seq}`, createdAt: new Date(), ...data };
    this.violations.push(violation);
    return violation as never;
  }

  async createPolicy(data: Record<string, unknown>) {
    const id = `policy-${++this.seq}`;
    const policy = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
    this.policiesStore.set(id, policy);
    return policy as never;
  }

  async updatePolicy(id: string, organizationId: string, data: Record<string, unknown>) {
    const existing = this.policiesStore.get(id);
    if (!existing || existing['organizationId'] !== organizationId) return undefined as never;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.policiesStore.set(id, updated);
    return updated as never;
  }

  async deletePolicy(id: string, organizationId: string) {
    const existing = this.policiesStore.get(id);
    if (!existing || existing['organizationId'] !== organizationId) return false as never;
    this.policiesStore.delete(id);
    return true as never;
  }
}

describe('Policies API (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const signToken = (payload: Record<string, unknown>) => jwtService.sign(payload);

  beforeAll(async () => {
    jwtService = new JwtService({ secret: TEST_JWT_SECRET });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [PoliciesController],
      providers: [
        PoliciesService,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
              return null;
            }),
          },
        },
        { provide: RunsRepository, useValue: new FakeRunsRepository() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const orgAAdminToken = () =>
    signToken({
      sub: 'user-a-admin',
      email: 'admin@org-a.test',
      organizationId: 'org-A',
      roles: [UserRole.ORG_ADMIN],
    });
  const orgAMemberToken = () =>
    signToken({
      sub: 'user-a-member',
      email: 'member@org-a.test',
      organizationId: 'org-A',
      roles: [UserRole.MEMBER],
    });
  const orgBAdminToken = () =>
    signToken({
      sub: 'user-b-admin',
      email: 'admin@org-b.test',
      organizationId: 'org-B',
      roles: [UserRole.ORG_ADMIN],
    });

  const validPolicyBody = {
    name: 'Latency Guard',
    description: 'Fails runs that exceed the latency budget',
    rules: [
      {
        id: 'rule-1',
        name: 'Max Latency',
        type: 'threshold',
        metric: 'latency_ms',
        operator: 'greater_than',
        threshold: 100,
        severity: 'fail',
        description: 'Latency must stay under 100ms',
        enabled: true,
      },
    ],
  };

  describe('POST /api/policies', () => {
    it('rejects a non-ORG_ADMIN/ADMIN caller with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAMemberToken()}`)
        .send(validPolicyBody)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('rejects an unauthenticated caller with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/policies')
        .send(validPolicyBody)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('rejects a malformed rule payload with 400 instead of persisting it', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({
          name: 'Broken Policy',
          rules: [{ id: 'rule-x', name: 'Missing fields' }],
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(Array.isArray(res.body.message)).toBe(true);
      expect(res.body.message.length).toBeGreaterThan(0);
    });

    it('creates a policy as ORG_ADMIN with the exact rule shape evaluateRun() consumes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send(validPolicyBody)
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBeDefined();
      expect(res.body.organizationId).toBe('org-A');
      expect(res.body.createdBy).toBe('user-a-admin');
      expect(res.body.isActive).toBe(true);
      expect(res.body.rules).toEqual(validPolicyBody.rules);
    });
  });

  describe('POST /api/policies/evaluate/:runId — applies the newly created policy', () => {
    it('evaluates a real run and reports a violation produced by the created policy rule', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ ...validPolicyBody, name: 'Latency Guard For Eval' })
        .expect(HttpStatus.CREATED);

      const fakeRepo = app.get(RunsRepository) as unknown as FakeRunsRepository;
      fakeRepo.seedRun({
        id: 'run-eval-1',
        organizationId: 'org-A',
        evalSpecId: 'spec-1',
        metrics: { latency_ms: 150 },
        triggeredBy: 'user-a-admin',
      });

      const evalRes = await request(app.getHttpServer())
        .post('/api/policies/evaluate/run-eval-1')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .expect(HttpStatus.CREATED);

      // Other tests in this file share the same in-memory fake and may have
      // created other active org-A policies before this one runs — assert on
      // the violation this specific policy produced, not on array length.
      expect(evalRes.body.decision).toBe('fail');
      const violationForThisPolicy = evalRes.body.violations.find(
        (v: { policyId: string }) => v.policyId === createRes.body.id,
      );
      expect(violationForThisPolicy).toMatchObject({
        policyId: createRes.body.id,
        policyName: 'Latency Guard For Eval',
        ruleName: 'Max Latency',
        severity: 'fail',
        actualValue: 150,
        expectedThreshold: 100,
      });
    });
  });

  describe('org isolation', () => {
    it('does not let org B see org A policies via GET /api/policies', async () => {
      await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ ...validPolicyBody, name: 'Org A Only Policy' })
        .expect(HttpStatus.CREATED);

      const res = await request(app.getHttpServer())
        .get('/api/policies')
        .set('Authorization', `Bearer ${orgBAdminToken()}`)
        .expect(HttpStatus.OK);

      expect(
        res.body.find((p: { name: string }) => p.name === 'Org A Only Policy'),
      ).toBeUndefined();
    });

    it('returns 404 when org B tries to update an org A policy (not silently hijacked)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ ...validPolicyBody, name: 'Org A Update Target' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .put(`/api/policies/${createRes.body.id}`)
        .set('Authorization', `Bearer ${orgBAdminToken()}`)
        .send({ name: 'Hijacked' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('returns 404 when org B tries to delete an org A policy', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ ...validPolicyBody, name: 'Org A Delete Target' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .delete(`/api/policies/${createRes.body.id}`)
        .set('Authorization', `Bearer ${orgBAdminToken()}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('allows org A to update its own policy', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ ...validPolicyBody, name: 'Org A Self Update' })
        .expect(HttpStatus.CREATED);

      const updateRes = await request(app.getHttpServer())
        .put(`/api/policies/${createRes.body.id}`)
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ isActive: false })
        .expect(HttpStatus.OK);

      expect(updateRes.body.isActive).toBe(false);
    });

    it('allows org A to delete its own policy', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/policies')
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .send({ ...validPolicyBody, name: 'Org A Self Delete' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .delete(`/api/policies/${createRes.body.id}`)
        .set('Authorization', `Bearer ${orgAAdminToken()}`)
        .expect(HttpStatus.OK);
    });
  });
});
