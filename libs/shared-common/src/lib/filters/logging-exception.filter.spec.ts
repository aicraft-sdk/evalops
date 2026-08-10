const mockStructuredLogger = { info: jest.fn(), error: jest.fn() };
jest.mock('pino', () => {
  const pinoFactory = jest.fn(() => mockStructuredLogger);
  (pinoFactory as unknown as { stdTimeFunctions: { isoTime: string } }).stdTimeFunctions = {
    isoTime: 'iso',
  };
  return pinoFactory;
});

import { UnauthorizedException, ArgumentsHost } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { LoggingExceptionFilter } from './logging-exception.filter';

/**
 * NestJS Guards run and can throw BEFORE Interceptors are ever invoked, so
 * LoggingInterceptor's error path structurally cannot observe a guard
 * rejection (e.g. a 401 from JwtAuthGuard). This filter is the backstop
 * that catches exactly those exceptions and emits the same structured JSON
 * log shape LoggingInterceptor's error path already produces.
 */
describe('LoggingExceptionFilter', () => {
  let reply: jest.Mock;
  let httpAdapterHost: HttpAdapterHost;

  function contextFor(request: Record<string, unknown>): ArgumentsHost {
    const response = { setHeader: jest.fn() };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  beforeEach(() => {
    mockStructuredLogger.info.mockClear();
    mockStructuredLogger.error.mockClear();
    reply = jest.fn();
    httpAdapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
  });

  it('logs a structured error line for an exception the interceptor never saw (no __evalopsLogged marker)', () => {
    const filter = new LoggingExceptionFilter(httpAdapterHost);
    const request = {
      method: 'GET',
      path: '/api/core/prompts',
      headers: {},
    };
    const host = contextFor(request);
    const exception = new UnauthorizedException();

    filter.catch(exception, host);

    expect(mockStructuredLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/core/prompts',
        statusCode: 401,
        requestId: expect.any(String),
        durationMs: expect.any(Number),
        organizationId: null,
        userId: null,
      }),
    );
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      exception.getResponse(),
      401,
    );
  });

  it('does not log again when the interceptor already logged this exact request (dedup marker set)', () => {
    const filter = new LoggingExceptionFilter(httpAdapterHost);
    const request = {
      method: 'POST',
      path: '/api/core/flows',
      headers: {},
      __evalopsLogged: true,
    };
    const host = contextFor(request);
    const exception = new UnauthorizedException();

    filter.catch(exception, host);

    expect(mockStructuredLogger.error).not.toHaveBeenCalled();
    // Still replies to the client either way.
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      exception.getResponse(),
      401,
    );
  });

  it('logs statusCode 500 and a generic body for a non-HttpException error', () => {
    const filter = new LoggingExceptionFilter(httpAdapterHost);
    const request = { method: 'GET', path: '/api/core/x', headers: {} };
    const host = contextFor(request);
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(mockStructuredLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: 'Error: boom' }),
    );
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
  });
});
