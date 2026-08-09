import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard, IS_PUBLIC_KEY } from '@evalops/shared-auth';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

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

/**
 * The JWT guard tests above only prove which routes carry the @Public()
 * decorator. They do NOT prove that a path-traversal payload (e.g.
 * `/api/integration/webhooks/github/../deliver`) is rejected before the
 * shared proxy() method forwards it downstream. Nest/Express route
 * matching happens before any guard runs, and does not normalize `..`
 * segments — so a crafted path can match the @Public() webhook route while
 * carrying a traversal sequence that (once axios/Node's URL parser
 * collapses it) actually targets a different, guarded downstream route.
 * These tests exercise the real proxy() path-validation logic directly.
 */
describe('GatewayController proxy() path-traversal protection', () => {
  let controller: GatewayController;
  let gatewayService: { proxyRequest: jest.Mock };

  function mockReq(path: string): Request {
    return { path, headers: {} } as unknown as Request;
  }

  function mockRes(): Response {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  }

  beforeEach(() => {
    gatewayService = {
      proxyRequest: jest.fn().mockResolvedValue({ received: true }),
    };
    controller = new GatewayController(gatewayService as unknown as GatewayService);
  });

  it('rejects a literal ".." traversal segment with 400 and never forwards the request', async () => {
    const req = mockReq('/api/integration/webhooks/github/../deliver');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/invalid|traversal/i),
      }),
    );
  });

  it('rejects a percent-encoded ".." segment (%2e%2e) with 400 and never forwards the request', async () => {
    // Express's req.path is NOT percent-decoded by default (verified
    // empirically against express@4.21 — req.path returns the raw
    // %2e%2e sequence untouched), so a naive raw-string "..": check on
    // fullPath would miss this. A curl --path-as-is client sends this
    // literally on the wire.
    const req = mockReq('/api/integration/webhooks/github/%2e%2e/deliver');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/invalid|traversal/i),
      }),
    );
  });

  it('rejects a mixed literal/encoded traversal segment (..%2f) with 400', async () => {
    const req = mockReq('/api/integration/webhooks/github/..%2fdeliver');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a fully percent-encoded traversal segment (%2e%2e%2f) with 400', async () => {
    const req = mockReq('/api/integration/webhooks/github/%2e%2e%2fdeliver');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a double-encoded traversal segment (%252e%252e) with 400', async () => {
    const req = mockReq('/api/integration/webhooks/github/%252e%252e/deliver');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects malformed percent-encoding rather than letting it throw uncaught', async () => {
    const req = mockReq('/api/integration/webhooks/github/%zzbogus');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('still forwards a legitimate webhook path unaffected by the traversal check', async () => {
    const req = mockReq('/api/integration/webhooks/github/abc123');
    const res = mockRes();

    await controller.proxyIntegrationWebhookGithub(req, res, {}, {});

    expect(gatewayService.proxyRequest).toHaveBeenCalledWith(
      'integration',
      '/webhooks/github/abc123',
      undefined,
      {},
      {},
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('rejects traversal on every route that shares the proxy() method, not just the webhook route', async () => {
    // The fix lives in the shared private proxy() helper used by all 5
    // @All()-decorated route handlers. Prove that here directly rather than
    // only on the webhook carve-out that motivated the fix.
    const routes: Array<
      [
        (
          req: Request,
          res: Response,
          body: unknown,
          headers: Record<string, string>,
        ) => Promise<unknown>,
        string,
      ]
    > = [
      [controller.proxyAuth.bind(controller), '/api/auth/../core/secrets'],
      [controller.proxyCore.bind(controller), '/api/core/../evaluation/x'],
      [
        controller.proxyEvaluation.bind(controller),
        '/api/evaluation/../auth/x',
      ],
      [
        controller.proxyIntegration.bind(controller),
        '/api/integration/../core/x',
      ],
      [
        controller.proxyAnalytics.bind(controller),
        '/api/analytics/../core/x',
      ],
    ];

    for (const [handler, path] of routes) {
      const req = mockReq(path);
      const res = mockRes();

      await handler(req, res, {}, {});

      expect(gatewayService.proxyRequest).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });
});
