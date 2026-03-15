import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restrict an endpoint to users with one of the specified roles.
 * Enforced by RbacGuard.
 *
 * @example @Roles(UserRole.ADMIN, UserRole.MEMBER)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
