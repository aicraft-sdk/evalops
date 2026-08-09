// Exceptions
export * from './lib/exceptions/business.exception';

// DTOs
export * from './lib/dto/pagination.dto';

// Utils
export * from './lib/utils/error.util';
export * from './lib/utils/response.util';
export * from './lib/utils/auth-token-extractor';

// Config
export * from './lib/config/redis.config';

// Clients
export * from './lib/clients/http-client.service';

// Redis
export * from './lib/redis/redis.module';

// Interceptors
export * from './lib/interceptors/logging.interceptor';
export { OrgContextInterceptor } from './lib/interceptors/org-context.interceptor';

// Filters
export { LoggingExceptionFilter } from './lib/filters/logging-exception.filter';

// Logging
export { structuredLogger } from './lib/logging/structured-logger';
export { buildBaseLogFields } from './lib/logging/log-fields';
export type { LoggableRequest, BaseLogFields } from './lib/logging/log-fields';

// Middleware
export {
  requestTimingMiddleware,
  getRequestStartMs,
} from './lib/middleware/request-timing.middleware';

// Request context (AsyncLocalStorage for per-request org isolation)
export { requestContext } from './lib/context/request-context';
export type { RequestContext } from './lib/context/request-context';

// Telemetry
export * from './lib/telemetry/telemetry.module';

// Testing utilities must be imported directly:
// import { ... } from '@evalops/shared-common/lib/testing/test-utils'
