import { CanActivate, ExecutionContext, ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENTITLEMENT_KEY } from '../decorators/requires-entitlement.decorator';
import { EntitlementService } from '../entitlement.service';
import type { EnterpriseFeature } from '../types/license.types';

/**
 * Enforces @RequiresEntitlement(feature). Apply AFTER JwtAuthGuard (mirrors RbacGuard).
 *
 * Deliberately does NOT mirror RbacGuard's "no metadata -> allow" default: an
 * EntitlementGuard applied to a route with no @RequiresEntitlement() decorator is a
 * configuration bug (a forgotten decorator would otherwise silently leak a paid feature
 * for free), so it fails loud with a 500, never a silent allow.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<EnterpriseFeature | undefined>(ENTITLEMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) {
      throw new InternalServerErrorException(
        'EntitlementGuard applied without @RequiresEntitlement() metadata — this is a configuration bug, not an entitlement decision.',
      );
    }

    if (this.entitlementService.hasFeature(feature)) return true;

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message: `This is an Enterprise feature ("${feature}"). Contact your administrator to upgrade to EvalOps Enterprise.`,
      upsell: true,
      feature,
    });
  }
}
