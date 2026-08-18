import { ForbiddenException, InternalServerErrorException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementGuard } from './entitlement.guard';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('EntitlementGuard', () => {
  it('throws InternalServerErrorException when applied without @RequiresEntitlement metadata (P4, edge case 15)', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const entitlementService = { hasFeature: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlementService as never);
    expect(() => guard.canActivate(makeContext())).toThrow(InternalServerErrorException);
  });

  it('resolves true when the feature is entitled', () => {
    const reflector = { getAllAndOverride: () => 'sso' } as unknown as Reflector;
    const entitlementService = { hasFeature: jest.fn().mockReturnValue(true) };
    const guard = new EntitlementGuard(reflector, entitlementService as never);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('throws ForbiddenException with the upsell body when the feature is not entitled (P2)', () => {
    const reflector = { getAllAndOverride: () => 'sso' } as unknown as Reflector;
    const entitlementService = { hasFeature: jest.fn().mockReturnValue(false) };
    const guard = new EntitlementGuard(reflector, entitlementService as never);
    try {
      guard.canActivate(makeContext());
      fail('expected ForbiddenException');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(response['upsell']).toBe(true);
      expect(response['feature']).toBe('sso');
      expect(response['statusCode']).toBe(403);
    }
  });

  it('never returns false (P2)', () => {
    const reflector = { getAllAndOverride: () => 'sso' } as unknown as Reflector;
    const entitlementService = { hasFeature: jest.fn().mockReturnValue(false) };
    const guard = new EntitlementGuard(reflector, entitlementService as never);
    expect(() => guard.canActivate(makeContext())).toThrow(); // never silently resolves false
  });
});
