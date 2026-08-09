const mockStructuredLogger = { info: jest.fn(), error: jest.fn() };
jest.mock('pino', () => {
  const pinoFactory = jest.fn(() => mockStructuredLogger);
  (pinoFactory as unknown as { stdTimeFunctions: { isoTime: string } }).stdTimeFunctions = {
    isoTime: 'iso',
  };
  return pinoFactory;
});

import { LoggingInterceptor } from './logging.interceptor';
import { of, throwError } from 'rxjs';
import * as otelApi from '@opentelemetry/api';

describe('LoggingInterceptor structured output', () => {
  beforeEach(() => {
    mockStructuredLogger.info.mockClear();
    mockStructuredLogger.error.mockClear();
  });

  it('logs trace_id, span_id, org_id, user_id, request_id on success', (done) => {
    jest.spyOn(otelApi.trace, 'getSpan').mockReturnValue({
      spanContext: () => ({ traceId: 'trace-abc', spanId: 'span-123' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const interceptor = new LoggingInterceptor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation();

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/api/prompts',
          headers: {},
          user: { organizationId: 'org-1', sub: 'user-1' },
        }),
        getResponse: () => ({ statusCode: 200, setHeader: jest.fn() }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = { handle: () => of({ ok: true }) } as any;

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [[loggedJson]] = logSpy.mock.calls;
        const parsed = JSON.parse(loggedJson as string);
        expect(parsed).toMatchObject({
          traceId: 'trace-abc',
          spanId: 'span-123',
          organizationId: 'org-1',
          userId: 'user-1',
        });
        expect(parsed.requestId).toBeDefined();
        done();
      },
    });
  });

  it('emits null trace_id/span_id when no span is active', (done) => {
    jest.spyOn(otelApi.trace, 'getSpan').mockReturnValue(undefined);
    const interceptor = new LoggingInterceptor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation();

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', path: '/x', headers: {} }),
        getResponse: () => ({ statusCode: 200, setHeader: jest.fn() }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = { handle: () => of({}) } as any;

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [[loggedJson]] = logSpy.mock.calls;
        const parsed = JSON.parse(loggedJson as string);
        expect(parsed.traceId).toBeNull();
        expect(parsed.spanId).toBeNull();
        done();
      },
    });
  });

  it('marks the request as already-logged on the error path, so LoggingExceptionFilter (which catches every exception, including ones this interceptor already saw) does not log the same event twice', (done) => {
    jest.spyOn(otelApi.trace, 'getSpan').mockReturnValue(undefined);
    const interceptor = new LoggingInterceptor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn((interceptor as any).logger, 'error').mockImplementation();

    const requestObj: Record<string, unknown> = {
      method: 'GET',
      path: '/api/core/prompts',
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => requestObj,
        getResponse: () => ({ statusCode: 200, setHeader: jest.fn() }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const thrown = { status: 500, message: 'boom' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = { handle: () => throwError(() => thrown) } as any;

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(requestObj['__evalopsLogged']).toBe(true);
        done();
      },
    });
  });

  it('dual-emits through structuredLogger.error on the error path, mirroring the success branch fields', (done) => {
    jest.spyOn(otelApi.trace, 'getSpan').mockReturnValue({
      spanContext: () => ({ traceId: 'trace-err', spanId: 'span-err' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const interceptor = new LoggingInterceptor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn((interceptor as any).logger, 'error').mockImplementation();

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/integration/webhooks/github/int-1',
          headers: {},
          user: { organizationId: 'org-2', sub: 'user-2' },
        }),
        getResponse: () => ({ statusCode: 200, setHeader: jest.fn() }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const thrown = { status: 401, message: 'Unauthorized' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = { handle: () => throwError(() => thrown) } as any;

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockStructuredLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            traceId: 'trace-err',
            spanId: 'span-err',
            organizationId: 'org-2',
            userId: 'user-2',
            requestId: expect.any(String),
            method: 'POST',
            path: '/api/integration/webhooks/github/int-1',
            statusCode: 401,
            durationMs: expect.any(Number),
            error: expect.any(String),
          }),
        );
        done();
      },
    });
  });
});
