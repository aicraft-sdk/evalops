import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { buildBaseLogFields, LoggableRequest } from '../logging/log-fields';
import { structuredLogger } from '../logging/structured-logger';
import { getRequestStartMs } from '../middleware/request-timing.middleware';

type RequestWithLogMarker = LoggableRequest & {
  __evalopsLogged?: boolean;
};

/**
 * Global catch-all exception filter — the logging backstop for exceptions
 * that never reach LoggingInterceptor.
 *
 * NestJS Guards run and can throw BEFORE Interceptors are ever invoked
 * (confirmed against @nestjs/core's router-execution-context: `fnCanActivate`
 * is awaited, THEN `interceptorsConsumer.intercept()` runs — strictly
 * after). That means LoggingInterceptor's error path structurally cannot
 * observe a 401 from JwtAuthGuard or a 429 from ThrottlerGuard, even though
 * those are exactly the events (failed auth attempts, rate-limited abuse)
 * most valuable to capture in structured logs.
 *
 * This filter registers as APP_FILTER (global) and catches EVERY unhandled
 * exception, so it sees guard rejections that LoggingInterceptor cannot.
 * Exceptions that DID pass through the interceptor chain (pipe/service/
 * controller errors) are already logged once by LoggingInterceptor's error
 * tap, which sets `request.__evalopsLogged = true` before the error
 * propagates further. This filter checks that marker and skips re-logging
 * those, so an ordinary controller error is logged exactly once — not
 * twice.
 *
 * Field-building is delegated to the same `buildBaseLogFields` helper
 * LoggingInterceptor uses, and both write through the same shared
 * `structuredLogger` pino instance, so the two emission paths cannot drift
 * apart in shape.
 *
 * Response handling: delegates to `HttpAdapterHost#reply` (the pattern
 * NestJS's own docs recommend for catch-all filters) and reuses
 * `exception.getResponse()` for HttpExceptions so the actual HTTP response
 * body/shape sent to clients is unchanged from Nest's built-in default
 * exception handling.
 */
@Injectable()
@Catch()
export class LoggingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithLogMarker>();
    const response = ctx.getResponse<{
      setHeader?: (key: string, value: string) => void;
    }>();
    const { httpAdapter } = this.httpAdapterHost;

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!request.__evalopsLogged) {
      const fields = buildBaseLogFields(request);
      const durationMs = Date.now() - getRequestStartMs(request);
      const errorMessage = String(exception);

      response.setHeader?.('x-request-id', fields.requestId);

      const logPayload = { ...fields, statusCode, durationMs, error: errorMessage };
      structuredLogger.error(logPayload);
      this.logger.error(JSON.stringify(logPayload));
    }

    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode, message: 'Internal server error' };

    httpAdapter.reply(response, responseBody, statusCode);
  }
}
