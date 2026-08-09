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
import { trace, context as otelContext } from '@opentelemetry/api';
const pino = require('pino') as typeof import('pino');

const structuredLogger = pino({ base: undefined, timestamp: pino.stdTimeFunctions.isoTime });

/**
 * Structured request/response logging interceptor.
 * Logs: traceId, spanId, organizationId, userId, requestId, method, path,
 * statusCode, durationMs.
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
      user?: { organizationId?: string; sub?: string; userId?: string; id?: string };
    }>();
    const response = http.getResponse<{
      statusCode: number;
      setHeader: (key: string, value: string) => void;
    }>();

    const requestId = request.headers['x-request-id'] ?? randomUUID();
    response.setHeader('x-request-id', requestId);

    const span = trace.getSpan(otelContext.active());
    const spanContext = span?.spanContext();
    const traceId = spanContext?.traceId ?? null;
    const spanId = spanContext?.spanId ?? null;
    const organizationId = request.user?.organizationId ?? null;
    // cf:shortcut: request.user.id is checked last because this repo's JwtStrategy
    // implementations (api-gateway/auth-service/core-service/evaluation-service) all
    // return { id: payload.sub, ... } from validate(), not `sub`/`userId` directly —
    // without this fallback userId would always be null for real authenticated requests.
    const userId = request.user?.sub ?? request.user?.userId ?? request.user?.id ?? null;

    const startMs = Date.now();
    const { method, path } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          structuredLogger.info({
            traceId,
            spanId,
            organizationId,
            userId,
            requestId,
            method,
            path,
            statusCode: response.statusCode,
            durationMs: Date.now() - startMs,
          });
          // Keep emitting through Nest's Logger too, for consistency with existing
          // log-aggregation expectations during transition — remove once a logging
          // backend is chosen (Out of Scope for this plan).
          this.logger.log(
            JSON.stringify({
              traceId, spanId, organizationId, userId, requestId,
              method, path, statusCode: response.statusCode,
              durationMs: Date.now() - startMs,
            }),
          );
        },
        error: (err: { status?: number }) => {
          this.logger.error(
            JSON.stringify({
              traceId, spanId, organizationId, userId, requestId,
              method, path, statusCode: err?.status ?? 500,
              durationMs: Date.now() - startMs, error: String(err),
            }),
          );
        },
      }),
    );
  }
}
