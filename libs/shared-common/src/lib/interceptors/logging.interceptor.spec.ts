import { LoggingInterceptor } from './logging.interceptor';
import { of } from 'rxjs';
import * as otelApi from '@opentelemetry/api';

describe('LoggingInterceptor structured output', () => {
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
});
