import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { db } from '@evalops/shared-db';
import { sql } from 'drizzle-orm';

/**
 * Tenant isolation interceptor.
 * Extracts organizationId from the JWT payload and sets the PostgreSQL
 * session variable app.org_id so that RLS policies activate for the request.
 *
 * Must run AFTER JwtAuthGuard so that request.user is populated.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { organizationId?: string };
    }>();

    const orgId = request.user?.organizationId;
    if (orgId) {
      // Set the Postgres session variable for this transaction
      // This is fire-and-forget; errors are non-fatal for non-RLS operations
      db.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`).catch(
        () => undefined,
      );
    }

    return next.handle();
  }
}
