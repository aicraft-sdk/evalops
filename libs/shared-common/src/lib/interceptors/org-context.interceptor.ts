import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { withTenantContext } from '@evalops/shared-db';
import { requestContext } from '../context/request-context';

/**
 * Org-context interceptor.
 *
 * Acquires a dedicated PoolClient, sets app.org_id on it (so RLS policies
 * activate on the SAME connection used by all downstream queries), then runs
 * the request inside nested AsyncLocalStorage scopes:
 *   - withTenantContext: makes db.* route to the RLS-enabled client.
 *   - requestContext: makes organizationId available to in-process callers
 *     without thread-local threading through call stacks.
 *
 * Must run AFTER JwtAuthGuard so that request.user is populated.
 * When no user is present (public endpoints, auth-service), orgId is ''
 * — the RLS policy returns no rows, which is the safe default.
 */
@Injectable()
export class OrgContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OrgContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { organizationId?: string };
    }>();
    const orgId: string = request.user?.organizationId ?? '';

    return new Observable((subscriber) => {
      withTenantContext(orgId, () =>
        requestContext.run({ organizationId: orgId }, () =>
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
