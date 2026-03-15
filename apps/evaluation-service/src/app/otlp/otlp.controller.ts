import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Headers,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { OtlpService } from './otlp.service';
import {
  OtlpExportTraceServiceRequest,
  OtlpExportTraceServiceResponse,
} from './otlp.dto';
import { CurrentUser, Public } from '@evalops/shared-auth';
import { OtlpAuthGuard } from './otlp-auth.guard';
import { ConfigService } from '@nestjs/config';

/**
 * OTLP Controller
 *
 * Accepts OTLP trace export requests in HTTP/JSON format.
 * Supports both JWT authentication (for SDK clients) and service token auth.
 *
 * Endpoint: POST /api/otlp/v1/traces
 */
@Controller('otlp/v1')
export class OtlpController {
  constructor(
    private readonly otlpService: OtlpService,
    private readonly configService: ConfigService
  ) {}

  /**
   * OTLP Trace Export endpoint
   *
   * Accepts OTLP ExportTraceServiceRequest in JSON format.
   * Can be authenticated via JWT (Authorization header) or service token (X-Service-Token).
   */
  @Post('traces')
  @HttpCode(HttpStatus.OK)
  @Public() // Bypass global JwtAuthGuard
  @UseGuards(OtlpAuthGuard)
  async exportTraces(
    @Body() request: OtlpExportTraceServiceRequest,
    @CurrentUser() user?: { organizationId: string },
    @Headers('x-service-token') serviceToken?: string,
    @Req() req?: { user?: { organizationId: string } }
  ): Promise<OtlpExportTraceServiceResponse> {
    // Extract organizationId from JWT user or service token context
    let organizationId: string;

    // Check JWT user first (from OtlpAuthGuard)
    const jwtUser = user || req?.user;
    if (jwtUser?.organizationId) {
      organizationId = jwtUser.organizationId;
    } else if (serviceToken) {
      // Service token auth - try to extract organizationId from resource attributes
      const orgIdFromAttributes =
        request.resourceSpans?.[0]?.resource?.attributes?.find(
          (attr) => attr.key === 'evalops.organization_id'
        )?.value?.stringValue;

      if (!orgIdFromAttributes) {
        throw new UnauthorizedException(
          'Service token authentication requires evalops.organization_id in resource attributes'
        );
      }
      organizationId = orgIdFromAttributes;
    } else {
      throw new UnauthorizedException(
        'Authentication required (JWT or service token)'
      );
    }

    // Validate request
    if (!request.resourceSpans || request.resourceSpans.length === 0) {
      return {
        partialSuccess: {
          rejectedSpans: 0,
          errorMessage: 'No resource spans provided',
        },
      };
    }

    const result = await this.otlpService.processTraceExport(
      request,
      organizationId
    );

    return {
      partialSuccess:
        result.spansRejected > 0
          ? {
              rejectedSpans: result.spansRejected,
              errorMessage: `Processed ${result.spansProcessed} spans, rejected ${result.spansRejected} spans`,
            }
          : undefined,
    };
  }
}
