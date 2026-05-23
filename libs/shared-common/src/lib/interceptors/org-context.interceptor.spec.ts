import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';

// Mock @evalops/shared-db so the test does not require a real Postgres connection.
// withTenantContext is the key export — it replaces the fire-and-forget db.execute.
jest.mock('@evalops/shared-db', () => ({
  withTenantContext: jest
    .fn()
    .mockImplementation(
      (_orgId: string, fn: () => unknown) => Promise.resolve(fn()),
    ),
}));

import { OrgContextInterceptor } from './org-context.interceptor';
import { requestContext } from '../context/request-context';
import { withTenantContext } from '@evalops/shared-db';

const mockWithTenantContext = withTenantContext as jest.Mock;

describe('OrgContextInterceptor', () => {
  let interceptor: OrgContextInterceptor;

  beforeEach(() => {
    interceptor = new OrgContextInterceptor();
    mockWithTenantContext.mockClear();
    // Restore default implementation after each test
    mockWithTenantContext.mockImplementation(
      (_orgId: string, fn: () => unknown) => Promise.resolve(fn()),
    );
  });

  function buildContext(user?: { organizationId?: string }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildHandler(value = 'ok'): CallHandler {
    return { handle: () => of(value) } as CallHandler;
  }

  it('calls withTenantContext with orgId when orgId is present', async () => {
    const ctx = buildContext({ organizationId: 'org-abc' });
    const handler = buildHandler();

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(mockWithTenantContext).toHaveBeenCalledTimes(1);
    expect(mockWithTenantContext.mock.calls[0][0]).toBe('org-abc');
  });

  it('calls withTenantContext with empty string when orgId is absent', async () => {
    const ctx = buildContext(undefined);
    const handler = buildHandler();

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(mockWithTenantContext).toHaveBeenCalledTimes(1);
    expect(mockWithTenantContext.mock.calls[0][0]).toBe('');
  });

  it('populates requestContext with organizationId', async () => {
    const ctx = buildContext({ organizationId: 'org-xyz' });
    let captured: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        captured = requestContext.getStore()?.organizationId;
        return of('done');
      },
    };

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(captured).toBe('org-xyz');
  });

  it('sets requestContext to empty string when no user', async () => {
    const ctx = buildContext(undefined);
    let captured: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        captured = requestContext.getStore()?.organizationId;
        return of('done');
      },
    };

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(captured).toBe('');
  });

  it('forwards handler value to subscriber', async () => {
    const ctx = buildContext({ organizationId: 'org-1' });
    const handler = buildHandler('response-value');

    const result$ = interceptor.intercept(ctx, handler);
    const value = await firstValueFrom(result$);

    expect(value).toBe('response-value');
  });

  it('propagates handler errors to subscriber', async () => {
    const ctx = buildContext({ organizationId: 'org-1' });
    const { throwError } = await import('rxjs');
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('handler error')),
    };

    const result$ = interceptor.intercept(ctx, handler);
    await expect(firstValueFrom(result$)).rejects.toThrow('handler error');
  });

  it('does NOT swallow errors — errors propagate via subscriber.error', async () => {
    mockWithTenantContext.mockRejectedValueOnce(new Error('tenant ctx failed'));
    const ctx = buildContext({ organizationId: 'org-fail' });
    const handler = buildHandler();

    const result$ = interceptor.intercept(ctx, handler);
    await expect(firstValueFrom(result$)).rejects.toThrow('tenant ctx failed');
  });
});
