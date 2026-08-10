import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

/**
 * OTLP Auth Guard
 *
 * Supports both JWT authentication (for SDK clients) and service token authentication.
 * Checks for JWT first, then falls back to service token if JWT is not present.
 */
@Injectable()
export class OtlpAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(OtlpAuthGuard.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { organizationId: string };
    }>();

    // Check for service token first (simpler check)
    const serviceToken = request.headers['x-service-token'];
    if (serviceToken) {
      const serviceSecret = this.configService.get<string>('SERVICE_SECRET');
      if (!serviceSecret) {
        throw new UnauthorizedException('SERVICE_SECRET is not configured');
      }

      if (serviceToken === serviceSecret) {
        // Service token is valid - organizationId will be extracted from request body in controller
        return true;
      }
    }

    // Try JWT authentication
    try {
      const jwtResult = await super.canActivate(context);
      if (jwtResult) {
        return true;
      }
    } catch (err: unknown) {
      this.logger.debug(
        `JWT auth failed, checking service token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    throw new UnauthorizedException(
      'Authentication required (JWT Bearer token or X-Service-Token)'
    );
  }
}
