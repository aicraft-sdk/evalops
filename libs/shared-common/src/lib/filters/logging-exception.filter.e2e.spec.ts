const mockStructuredLogger = { info: jest.fn(), error: jest.fn() };
jest.mock('pino', () => {
  const pinoFactory = jest.fn(() => mockStructuredLogger);
  (pinoFactory as unknown as { stdTimeFunctions: { isoTime: string } }).stdTimeFunctions = {
    isoTime: 'iso',
  };
  return pinoFactory;
});

import {
  Controller,
  Get,
  Injectable,
  CanActivate,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LoggingExceptionFilter } from './logging-exception.filter';

/**
 * Proves the guard-rejection logging gap is closed using the REAL NestJS
 * dispatch pipeline (Test.createNestApplication + a real rejecting guard +
 * supertest), not a hand-mocked `next.handle()` throwing an error. A
 * hand-mocked interceptor test would NOT prove this: NestJS guards run and
 * can throw BEFORE interceptors are ever invoked, so this is exactly the
 * gap that let the original defect go undetected.
 */
@Injectable()
class AlwaysDenyGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

@Controller('protected')
class ProtectedController {
  @Get()
  get() {
    return { ok: true };
  }
}

describe('LoggingExceptionFilter (real pipeline)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockStructuredLogger.error.mockClear();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProtectedController],
      providers: [
        { provide: APP_GUARD, useClass: AlwaysDenyGuard },
        { provide: APP_FILTER, useClass: LoggingExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('produces a structured JSON log line (statusCode 401) when a real guard rejects the request', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);

    expect(mockStructuredLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/protected',
        statusCode: 401,
        requestId: expect.any(String),
        durationMs: expect.any(Number),
      }),
    );
  });
});
