/**
 * Shape of `request.user` for endpoints guarded by `JwtAuthGuard`.
 *
 * Mirrors the object returned by `JwtStrategy.validate()`
 * (see `../strategies/jwt.strategy.ts`), which is what Passport attaches
 * to the request after a JWT is verified.
 *
 * Defined locally (not in `@evalops/shared-db` or `@evalops/shared-auth`)
 * because it is a projection of the `users` table shaped specifically for
 * this service's request pipeline, not a general-purpose shared DTO.
 */
export interface AuthenticatedRequestUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  organizationId: string;
  role: string;
}
