import { ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, firstValueFrom } from 'rxjs';

// Mock @evalops/shared-auth so IS_PUBLIC_KEY is available in tests.
jest.mock('@evalops/shared-auth', () => ({
  IS_PUBLIC_KEY: 'isPublic',
}));

// Mock @evalops/shared-db so the test does not require a real Postgres connection.
// withTenantContext is the key export — it now takes a context object.
jest.mock('@evalops/shared-db', () => ({
  withTenantContext: jest
    .fn()
    .mockImplementation(
      (_ctx: { orgId: string; userId: string; role: string }, fn: () => unknown) => Promise.resolve(fn()),
    ),
}));

import { OrgContextInterceptor } from './org-context.interceptor';
import { requestContext } from '../context/request-context';
import { withTenantContext } from '@evalops/shared-db';

const mockWithTenantContext = withTenantContext as jest.Mock;

describe('OrgContextInterceptor', () => {
  let interceptor: OrgContextInterceptor;
  let mockReflector: { get: jest.Mock };

  beforeEach(() => {
    mockReflector = {
      get: jest.fn().mockReturnValue(false),
    };
    interceptor = new OrgContextInterceptor(mockReflector as unknown as Reflector);
    mockWithTenantContext.mockClear();
    // Restore default implementation after each test
    mockWithTenantContext.mockImplementation(
      (_ctx: { orgId: string; userId: string; role: string }, fn: () => unknown) => Promise.resolve(fn()),
    );
  });

  function buildContext(user?: {
    organizationId?: string;
    id?: string;
    role?: string;
  }): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
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
    expect(mockWithTenantContext.mock.calls[0][0]).toMatchObject({ orgId: 'org-abc' });
  });

  it('calls withTenantContext with empty string when orgId is absent', async () => {
    const ctx = buildContext(undefined);
    const handler = buildHandler();

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(mockWithTenantContext).toHaveBeenCalledTimes(1);
    expect(mockWithTenantContext.mock.calls[0][0]).toMatchObject({ orgId: '' });
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

  it('throws UnauthorizedException when user exists but organizationId is missing', async () => {
    const ctx = buildContext({});
    const handler = buildHandler();

    // The interceptor may throw synchronously before returning an Observable,
    // or it may wrap the error in an Observable. Handle both.
    let thrown: unknown;
    try {
      const result$ = interceptor.intercept(ctx, handler);
      await firstValueFrom(result$);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnauthorizedException);
  });

  it('skips withTenantContext for @Public() routes', async () => {
    (mockReflector.get as jest.Mock).mockReturnValue(true);
    const ctx = buildContext(undefined);
    const handler = buildHandler();

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(mockWithTenantContext).not.toHaveBeenCalled();
  });

  it('propagates userId and role through requestContext', async () => {
    const ctx = buildContext({ organizationId: 'org-1', id: 'user-123', role: 'admin' });
    let capturedUserId: string | undefined;
    let capturedRole: string | undefined;

    const handler: CallHandler = {
      handle: () => {
        capturedUserId = requestContext.getStore()?.userId;
        capturedRole = requestContext.getStore()?.role;
        return of('done');
      },
    };

    const result$ = interceptor.intercept(ctx, handler);
    await firstValueFrom(result$);

    expect(capturedUserId).toBe('user-123');
    expect(capturedRole).toBe('admin');
  });
});
