import {
  Controller,
  All,
  Req,
  Res,
  Body,
  Headers,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GatewayService } from './gateway.service';
import { Public } from '@evalops/shared-auth';

// Headers that must never be forwarded verbatim from the gateway to a
// downstream service in this internal gateway -> trusted-downstream-service
// proxy:
//  - host: must be the downstream host, not the gateway's
//  - connection / transfer-encoding: hop-by-hop headers that are meaningless
//    (or actively wrong) once re-sent by a brand new outbound HTTP client
//  - content-length: gatewayService.proxyRequest's outbound HTTP client
//    (axios) recalculates this from the actual serialized body
//  - content-type: gatewayService.proxyRequest already sets an explicit
//    default ('application/json') for the outbound request; blindly
//    forwarding the client's content-type would silently override that
//    existing, deliberate behavior
// Deliberately a DENYLIST, not an allowlist: a narrow allowlist has twice
// silently dropped a header some downstream route actually needs (most
// recently X-Hub-Signature-256/X-GitHub-Event for GitHub webhook HMAC
// verification and X-Service-Token for ServiceAuthGuard) — forwarding
// broadly and excluding only headers with a concrete, demonstrated reason
// to exclude avoids repeating that bug class for the next new
// auth/signature scheme on any downstream route.
const NON_FORWARDABLE_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'content-type',
  'transfer-encoding',
]);

@Controller()
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @All('auth/*')
  @Public() // Gateway handles auth separately
  async proxyAuth(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('auth', req, res, body, headers);
  }

  @All('core/*')
  async proxyCore(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('core', req, res, body, headers);
  }

  @All('evaluation/*')
  async proxyEvaluation(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('evaluation', req, res, body, headers);
  }

  // GitHub authenticates webhook deliveries via HMAC signature
  // (x-hub-signature-256), never a Bearer JWT — so this specific sub-path must
  // be exempt from the gateway's global JwtAuthGuard. It MUST stay declared
  // ABOVE the generic `integration/*` route below: Nest registers Express
  // routes in class-declaration order, and Express matches the first route
  // whose pattern fits, not the most specific one. If the generic wildcard
  // were declared first, it would swallow this request and the @Public()
  // exemption below would never be reached. Do not "clean up" this as a
  // duplicate of proxyIntegration — signature verification still happens
  // downstream in WebhooksController; this only removes the gateway's JWT
  // guard for this one sub-path so the request can reach that verification.
  @Public()
  @All('integration/webhooks/github/*')
  async proxyIntegrationWebhookGithub(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('integration', req, res, body, headers);
  }

  @All('integration/*')
  async proxyIntegration(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('integration', req, res, body, headers);
  }

  @All('analytics/*')
  async proxyAnalytics(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('analytics', req, res, body, headers);
  }

  private async proxy(
    serviceName: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      // Extract path after service name
      // e.g., /api/core/prompts -> /prompts
      const fullPath = req.path;

      // Reject directory-traversal sequences BEFORE building the outbound
      // URL. Nest/Express route matching happens before this point and does
      // not normalize `..` segments, so a request can match a @Public()
      // route (e.g. the GitHub webhook carve-out) while carrying a `..`
      // segment that axios/Node's URL parser later collapses into a
      // different, guarded downstream route. This check applies to every
      // caller of the shared proxy() method, not just webhook routes.
      if (this.containsPathTraversal(fullPath)) {
        throw new BadRequestException(
          'Invalid path: directory traversal sequences are not allowed',
        );
      }

      const servicePrefix = `/api/${serviceName}`;
      let servicePath = fullPath.replace(servicePrefix, '') || '/';
      
      // Ensure path starts with /
      if (!servicePath.startsWith('/')) {
        servicePath = '/' + servicePath;
      }

      // Forward all incoming headers to the downstream service except the
      // small denylist above. Node/Express lowercases all incoming header
      // names on req.headers, so the denylist lookup and the forwarded key
      // are both already lowercase.
      const forwardHeaders: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined || NON_FORWARDABLE_HEADERS.has(name)) {
          continue;
        }
        forwardHeaders[name] = Array.isArray(value) ? value.join(', ') : value;
      }

      const result = await this.gatewayService.proxyRequest(
        serviceName,
        servicePath,
        req.method,
        body,
        forwardHeaders,
      );

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const message = error.message || 'Internal server error';
        return res.status(status).json({ message });
      }
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({ message });
    }
  }

  private containsPathTraversal(path: string): boolean {
    // Express's req.path is NOT percent-decoded by default (verified
    // empirically against express@4.21), so a raw `..` check alone misses
    // encoded forms (%2e%2e, ..%2f, %2e%2e%2f). Decode iteratively — up to
    // a small fixed bound — to also catch double-encoded sequences
    // (%252e%252e) without looping forever on pathological input.
    // Malformed percent-encoding (URIError) is itself treated as
    // suspicious and rejected rather than allowed through.
    let decoded = path;
    for (let i = 0; i < 5; i++) {
      let next: string;
      try {
        next = decodeURIComponent(decoded);
      } catch {
        return true;
      }
      if (next === decoded) {
        break;
      }
      decoded = next;
    }

    // Treat BOTH `/` and `\` as path separators. Node's URL parser (and
    // thus axios, which gateway.service.ts uses to build the actual
    // outbound request) treats `\` as equivalent to `/` for special
    // (http/https) schemes — so `..\` must be rejected exactly like `../`.
    // This matters even when the collapsed result stays under the same
    // `/api/<service>` prefix: e.g. `/api/integration/webhooks/github/..\
    // deliver` collapses to `/api/integration/webhooks/deliver`, which is
    // still "under" `/api/integration/` but is a COMPLETELY DIFFERENT
    // downstream route than the one Express's literal route-matching (and
    // this route's @Public() exemption) actually evaluated. A prefix-only
    // check would miss that; rejecting on the presence of a `..` segment
    // (after normalizing separators) does not.
    if (decoded.split(/[/\\]/).includes('..')) {
      return true;
    }

    // Defense-in-depth structural backstop: construct the exact URL the
    // way axios/Node will when gateway.service.ts sends the outbound
    // request, and compare its normalized pathname against the
    // already-decoded one (re-decoding the normalized result first, so
    // benign percent-re-encoding of reserved characters like spaces does
    // not produce a false positive). ANY remaining divergence means Node's
    // URL parser rewrote or collapsed something that the gateway's
    // guards/route-matching never saw — reject rather than trying to
    // enumerate every future separator or encoding variant by hand.
    try {
      const normalized = new URL(decoded, 'http://gateway.internal').pathname;
      if (decodeURIComponent(normalized) !== decoded) {
        return true;
      }
    } catch {
      return true;
    }

    return false;
  }
}
