import { SetMetadata } from '@nestjs/common';
import type { EnterpriseFeature } from '../types/license.types';

export const ENTITLEMENT_KEY = 'requiresEntitlement';

/**
 * Marks a route as requiring a specific Enterprise entitlement.
 * Enforced by EntitlementGuard — mirrors @Roles()/RbacGuard in @evalops/shared-auth.
 *
 * @example @RequiresEntitlement('sso')
 */
export const RequiresEntitlement = (feature: EnterpriseFeature) => SetMetadata(ENTITLEMENT_KEY, feature);
