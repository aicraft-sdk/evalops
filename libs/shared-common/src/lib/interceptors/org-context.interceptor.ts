import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { withTenantContext } from '@evalops/shared-db';
import { IS_PUBLIC_KEY } from '@evalops/shared-auth';
import { requestContext } from '../context/request-context';

/**
 * Org-context interceptor.
 *
 * Acquires a dedicated PoolClient, sets app.org_id / app.user_id / app.role on it
 * (so RLS policies activate on the SAME connection used by all downstream queries),
 * then runs the request inside nested AsyncLocalStorage scopes:
 *   - withTenantContext: makes db.* route to the RLS-enabled client.
 *   - requestContext: makes organizationId/userId/role available to in-process
 *     callers without threading through call stacks.
 *
 * Must run AFTER JwtAuthGuard so that request.user is populated.
 *
 * Public routes (decorated with @Public()) are short-circuited — withTenantContext
 * is NOT called and no RLS session variables are set.
 *
 * When a user is present but organizationId is missing, throws UnauthorizedException
 * (fail-closed: a JWT without an org claim is a bug, not a default).
 *
 * When no user is present (unauthenticated requests that pass through), orgId/userId/role
 * default to '' — the RLS policy returns no rows, which is the safe default.
 */
@Injectable()
export class OrgContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OrgContextInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Short-circuit for @Public() routes — no tenant context needed.
    const isPublic = this.reflector.get<boolean>(IS_PUBLIC_KEY, context.getHandler())
      ?? this.reflector.get<boolean>(IS_PUBLIC_KEY, context.getClass());
    if (isPublic) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      user?: { organizationId?: string; sub?: string; userId?: string; role?: string };
    }>();

    // Fail-closed: if a user is present but has no orgId, the JWT is malformed.
    if (request.user !== undefined && !request.user.organizationId) {
      throw new UnauthorizedException('Missing org claim');
    }

    const orgId: string = request.user?.organizationId ?? '';
    const userId: string = request.user?.sub ?? request.user?.userId ?? '';
    const role: string = request.user?.role ?? '';

    return new Observable((subscriber) => {
      withTenantContext({ orgId, userId, role }, () =>
        requestContext.run({ organizationId: orgId, userId, role }, () =>
          lastValueFrom(next.handle()),
        ),
      )
        .then((val) => {
          subscriber.next(val);
          subscriber.complete();
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Request context failed for org=${orgId}: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
          subscriber.error(err);
        });
    });
  }
}
