import { randomUUID } from 'crypto';
import { trace, context as otelContext } from '@opentelemetry/api';

export interface LoggableRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  user?: {
    organizationId?: string;
    sub?: string;
    userId?: string;
    id?: string;
  };
}

export interface BaseLogFields {
  traceId: string | null;
  spanId: string | null;
  organizationId: string | null;
  userId: string | null;
  requestId: string;
  method: string;
  path: string;
}

/**
 * Builds the fields common to every structured log line (success or error)
 * emitted for a request: traceId/spanId, organizationId/userId, requestId,
 * method, path.
 *
 * Shared by LoggingInterceptor (success/error paths, for requests that
 * reach the interceptor chain) and LoggingExceptionFilter (the backstop for
 * exceptions thrown by Guards, which run BEFORE interceptors and so never
 * reach LoggingInterceptor at all) so both emission paths produce the exact
 * same field shape and cannot drift apart.
 */
export function buildBaseLogFields(request: LoggableRequest): BaseLogFields {
  const span = trace.getSpan(otelContext.active());
  const spanContext = span?.spanContext();
  const traceId = spanContext?.traceId ?? null;
  const spanId = spanContext?.spanId ?? null;
  const organizationId = request.user?.organizationId ?? null;
  // cf:shortcut: request.user.id is checked last because this repo's JwtStrategy
  // implementations (api-gateway/auth-service/core-service/evaluation-service) all
  // return { id: payload.sub, ... } from validate(), not `sub`/`userId` directly —
  // without this fallback userId would always be null for real authenticated requests.
  const userId =
    request.user?.sub ?? request.user?.userId ?? request.user?.id ?? null;
  const requestId = request.headers['x-request-id'] ?? randomUUID();

  return {
    traceId,
    spanId,
    organizationId,
    userId,
    requestId,
    method: request.method,
    path: request.path,
  };
}
