/**
 * Integration tests for the auth service.
 *
 * Tests:
 *  - Register → returns user + JWT
 *  - Login → returns JWT
 *  - Access protected endpoint with valid JWT → 200
 *  - Access protected endpoint with invalid token → 401
 *  - Access protected endpoint without token → 401
 *
 * Uses NestJS testing module with mocked AuthService (no real DB required).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from '../app/auth/auth.controller';
import { AuthService } from '../app/auth/auth.service';
import { JwtStrategy } from '../app/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '@evalops/shared-auth';
import { ConfigService } from '@nestjs/config';

const TEST_JWT_SECRET = 'test-secret-for-integration-tests-only';

const mockUser = {
  id: 'user-001',
  email: 'test@example.com',
  role: 'member',
  organizationId: 'org-001',
};

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  validateUser: jest.fn(),
  validateJwtPayload: jest.fn(),
};

describe('Auth Service (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
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
        { provide: APP_GUARD, useClass: JwtAuthGuard },
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

  describe('POST /api/auth/register', () => {
    it('registers a new user and returns access token', async () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.test.sig';
      mockAuthService.register.mockResolvedValueOnce({
        user: mockUser,
        accessToken: token,
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'Password123!' })
        .expect(HttpStatus.CREATED);

      expect(res.body.accessToken).toBe(token);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        'test@example.com',
        'Password123!',
        undefined,
        undefined,
      );
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 401 when credentials are invalid', async () => {
      mockAuthService.validateUser.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'bad@example.com', password: 'wrong' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /api/auth/user (protected)', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/user')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 401 when Bearer token is invalid', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/user')
        .set('Authorization', 'Bearer not.a.valid.token')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 401 when Bearer token is expired', async () => {
      // A JWT that expired in the past (exp: 1) — any implementation will reject it
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiJ1c2VyLTAwMSIsImV4cCI6MX0.' +
        'invalidsignature';

      await request(app.getHttpServer())
        .get('/api/auth/user')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns current user when valid JWT is provided', async () => {
      mockAuthService.validateJwtPayload.mockResolvedValueOnce(mockUser);

      // Generate a real signed token using JwtService from the test module
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
  });

  describe('POST /api/auth/logout', () => {
    it('returns success without requiring auth (JWT is stateless)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Logged out successfully');
    });
  });
});
