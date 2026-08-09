import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { buildBaseLogFields, LoggableRequest } from '../logging/log-fields';
import { structuredLogger } from '../logging/structured-logger';
import { getRequestStartMs } from '../middleware/request-timing.middleware';

type RequestWithLogMarker = LoggableRequest & { __evalopsLogged?: boolean };

/**
 * Structured request/response logging interceptor.
 * Logs: traceId, spanId, organizationId, userId, requestId, method, path,
 * statusCode, durationMs.
 *
 * Injects x-request-id header into the response if not already present.
 *
 * Note: this interceptor only ever sees requests that made it PAST any
 * Guards (Guards run before Interceptors in NestJS's request lifecycle).
 * Exceptions thrown by Guards (e.g. JwtAuthGuard 401s, ThrottlerGuard 429s)
 * are logged instead by LoggingExceptionFilter, the global APP_FILTER
 * backstop — both share `buildBaseLogFields`/`structuredLogger` so their
 * output cannot drift apart in shape.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithLogMarker>();
    const response = http.getResponse<{
      statusCode: number;
      setHeader: (key: string, value: string) => void;
    }>();

    const fields = buildBaseLogFields(request);
    response.setHeader('x-request-id', fields.requestId);

    const startMs = getRequestStartMs(request);

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startMs;
          structuredLogger.info({
            ...fields,
            statusCode: response.statusCode,
            durationMs,
          });
          // Keep emitting through Nest's Logger too, for consistency with existing
          // log-aggregation expectations during transition — remove once a logging
          // backend is chosen (Out of Scope for this plan).
          this.logger.log(
            JSON.stringify({
              ...fields,
              statusCode: response.statusCode,
              durationMs,
            }),
          );
        },
        error: (err: { status?: number }) => {
          const statusCode = err?.status ?? 500;
          const durationMs = Date.now() - startMs;
          const errorMessage = String(err);
          const logPayload = {
            ...fields,
            statusCode,
            durationMs,
            error: errorMessage,
          };
          structuredLogger.error(logPayload);
          this.logger.error(JSON.stringify(logPayload));
          // Tell LoggingExceptionFilter (the global APP_FILTER, which sees
          // EVERY unhandled exception regardless of where it originated)
          // that this exact request/exception was already logged here, so
          // it does not emit a duplicate line for the same event.
          request.__evalopsLogged = true;
        },
      }),
    );
  }
}
