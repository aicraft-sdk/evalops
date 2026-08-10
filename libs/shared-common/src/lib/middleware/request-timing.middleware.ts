/**
 * Stamps the request with its arrival time as early as possible in the HTTP
 * pipeline (Express middleware runs BEFORE NestJS Guards/Interceptors), so
 * that durationMs can be computed accurately even for requests that are
 * rejected by a Guard before ever reaching an Interceptor.
 *
 * Register once per service, before any NestJS-level wiring:
 *   const app = await NestFactory.create(AppModule);
 *   app.use(requestTimingMiddleware);
 */
export function requestTimingMiddleware(
  req: Record<string, unknown>,
  _res: unknown,
  next: () => void,
): void {
  req['__evalopsStartMs'] = Date.now();
  next();
}

/**
 * Reads the timestamp stamped by requestTimingMiddleware. Falls back to
 * `Date.now()` (yielding durationMs=0) when the middleware was not
 * registered — e.g. in isolated unit tests that construct an interceptor or
 * filter directly without booting a full Nest HTTP pipeline.
 */
export function getRequestStartMs(req: object): number {
  const stamped = (req as Record<string, unknown>)['__evalopsStartMs'];
  return typeof stamped === 'number' ? stamped : Date.now();
}
