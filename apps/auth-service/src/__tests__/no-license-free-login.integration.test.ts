/**
 * Proves two things with a REAL NestJS app + REAL HTTP requests (supertest), no mocked
 * guards/routing:
 *
 *  1. The free JWT+PAT login path (POST /api/auth/login, GET /api/auth/user) is completely
 *     unaffected by the presence of @evalops/licensing / @evalops/ee-sso in AuthModule, when
 *     NO Enterprise license (EVALOPS_LICENSE_KEY) is configured.
 *  2. The relocated, entitlement-gated SSO routes (GET /auth/microsoft[/callback]) correctly
 *     403 with the Enterprise upsell body when no license is configured — proving
 *     EntitlementGuard actually gates them post-relocation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { AuthController } from '../app/auth/auth.controller';
import { AuthService } from '../app/auth/auth.service';
import { JwtStrategy } from '../app/auth/strategies/jwt.strategy';
import { LocalStrategy } from '../app/auth/strategies/local.strategy';
import { LicenseModule } from '@evalops/licensing';
import {
  MicrosoftAuthController,
  MicrosoftAuthService,
  SSO_USER_PROVISIONER,
} from '@evalops/ee-sso';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

const TEST_JWT_SECRET = 'test-secret-for-no-license-integration-tests-only';
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

describe('No Enterprise license configured (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '24h' },
        }),
        LicenseModule.forRoot({ publicKeyPem: testPublicKeyPem }),
      ],
      controllers: [AuthController, MicrosoftAuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        JwtStrategy,
        LocalStrategy,
        MicrosoftAuthService,
        { provide: SSO_USER_PROVISIONER, useExisting: AuthService },
        {
          provide: ConfigService,
          useValue: {
            // Deliberately no EVALOPS_LICENSE_KEY, no MICROSOFT_* vars — only JWT_SECRET,
            // matching the "license/SSO not configured at all" real-world default.
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JWT_SECRET') return TEST_JWT_SECRET;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
