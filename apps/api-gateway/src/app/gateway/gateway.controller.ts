import {
  Controller,
  All,
  Req,
  Res,
  Body,
  Headers,
  Param,
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
}
