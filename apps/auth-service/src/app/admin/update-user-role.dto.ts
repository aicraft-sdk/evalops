import { IsEnum } from 'class-validator';
import { UserRole } from '@evalops/shared-auth';

/**
 * Request body for `POST /admin/users/:id/role`.
 *
 * Deliberately a class-validator-decorated class, NOT a plain `{ role:
 * string }` inline type — mirrors the exact fix already applied to
 * `UpdateOrganizationDto`/`CreateOrganizationDto` for the identical reason:
 * NestJS's global `ValidationPipe` (`whitelist: true, transform: true`, see
 * main.ts) only validates AND strips unknown properties when the `@Body()`
 * param's runtime metatype is an actual class — a plain TS type/interface
 * resolves to `Object` at runtime and the pipe silently no-ops. Without this,
 * any real ADMIN could set another user's `role` column to an arbitrary
 * non-enum string, silently locking that user out of every `@Roles()`-gated
 * route platform-wide (their re-derived `roles` array would never match any
 * required role again).
 */
export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
