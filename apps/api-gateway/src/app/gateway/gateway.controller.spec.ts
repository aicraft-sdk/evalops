import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard, IS_PUBLIC_KEY } from '@evalops/shared-auth';
import { GatewayController } from './gateway.controller';

/**
 * GitHub authenticates webhook deliveries via HMAC signature
 * (x-hub-signature-256), never a Bearer JWT. `integration/webhooks/github/*`
 * must be exempt from the gateway's global JwtAuthGuard, while every other
 * `integration/*` sub-route (artifacts, alerts, sandbox, storage) must still
 * require a valid JWT.
 */
describe('GatewayController JWT guard exemption', () => {
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(reflector);

  function contextFor(
    handler: (...args: unknown[]) => unknown,
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => GatewayController,
    } as unknown as ExecutionContext;
  }

  it('exempts the GitHub webhook integration sub-route from JWT auth', () => {
    const context = contextFor(
      GatewayController.prototype.proxyIntegrationWebhookGithub,
    );

    // JwtAuthGuard short-circuits to `true` for @Public() routes before ever
    // invoking the passport 'jwt' strategy, so this proves the exemption
    // without needing a live strategy/token.
    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not exempt the generic integration proxy route', () => {
    const context = contextFor(GatewayController.prototype.proxyIntegration);

    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    expect(isPublic).toBeFalsy();
  });

  it('does not accidentally exempt other proxy routes sharing the generic integration path', () => {
    const context = contextFor(GatewayController.prototype.proxyCore);

    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    expect(isPublic).toBeFalsy();
  });
});
