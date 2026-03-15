import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

/**
 * Structured request/response logging interceptor.
 * Logs: method, path, statusCode, durationMs, organizationId, x-request-id
 *
 * Injects x-request-id header into the response if not already present.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      path: string;
      headers: Record<string, string>;
      user?: { organizationId?: string };
    }>();
    const response = http.getResponse<{
      statusCode: number;
      setHeader: (key: string, value: string) => void;
    }>();

    // Ensure a correlation ID exists on the request
    const requestId =
      request.headers['x-request-id'] ?? randomUUID();
    response.setHeader('x-request-id', requestId);

    const startMs = Date.now();
    const { method, path } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            JSON.stringify({
              requestId,
              method,
              path,
              statusCode: response.statusCode,
              durationMs: Date.now() - startMs,
              organizationId: request.user?.organizationId ?? null,
            }),
          );
        },
        error: (err: { status?: number }) => {
          this.logger.error(
            JSON.stringify({
              requestId,
              method,
              path,
              statusCode: err?.status ?? 500,
              durationMs: Date.now() - startMs,
              organizationId: request.user?.organizationId ?? null,
              error: String(err),
            }),
          );
        },
      }),
    );
  }
}
