import {
  Controller,
  All,
  Req,
  Res,
  Body,
  Headers,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GatewayService } from './gateway.service';
import { Public } from '@evalops/shared-auth';

@Controller()
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @All('auth/*')
  @Public() // Gateway handles auth separately
  async proxyAuth(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('auth', req, res, body, headers);
  }

  @All('core/*')
  async proxyCore(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('core', req, res, body, headers);
  }

  @All('evaluation/*')
  async proxyEvaluation(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
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
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('integration', req, res, body, headers);
  }

  @All('integration/*')
  async proxyIntegration(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('integration', req, res, body, headers);
  }

  @All('analytics/*')
  async proxyAnalytics(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.proxy('analytics', req, res, body, headers);
  }

  private async proxy(
    serviceName: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
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

      // Forward authorization header
      const forwardHeaders: Record<string, string> = {};
      if (req.headers.authorization) {
        forwardHeaders['Authorization'] = req.headers.authorization as string;
      }

      // Forward other relevant headers
      if (req.headers['x-request-id']) {
        forwardHeaders['x-request-id'] = req.headers['x-request-id'] as string;
      }

      const result = await this.gatewayService.proxyRequest(
        serviceName,
        servicePath,
        req.method,
        body,
        forwardHeaders,
      );

      return res.status(200).json(result);
    } catch (error: any) {
      const status = error.status || 500;
      const message = error.message || 'Internal server error';
      return res.status(status).json({ message });
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

    return decoded.split('/').includes('..');
  }
}
