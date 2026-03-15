import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Service-to-service authentication guard.
 * Validates the X-Service-Token header against SERVICE_SECRET env var.
 *
 * Apply to internal-only routes that should not be reachable by regular JWT users.
 *
 * Usage:
 *   @UseGuards(ServiceAuthGuard)
 *   @Public()  // bypass JwtAuthGuard
 *   internalEndpoint() {}
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
    }>();

    const serviceSecret = this.configService.get<string>('SERVICE_SECRET');
    if (!serviceSecret) {
      throw new UnauthorizedException('SERVICE_SECRET is not configured');
    }

    const token = request.headers['x-service-token'];
    if (!token || token !== serviceSecret) {
      throw new UnauthorizedException('Invalid service token');
    }

    return true;
  }
}
