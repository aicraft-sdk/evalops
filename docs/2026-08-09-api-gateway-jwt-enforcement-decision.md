# API Gateway JWT Auth Enforcement

## What Changed

`api-gateway` now enforces `JwtAuthGuard` globally (`APP_GUARD`, alongside the
existing `ThrottlerGuard`), rejecting unauthenticated requests at the gateway
itself instead of only relying on each downstream service to validate the
token independently. Two routes are explicitly exempted via `@Public()`:
the gateway's own scaffold root route (`GET /api`) and the GitHub webhook
sub-path (`/api/integration/webhooks/github/*`, which authenticates via HMAC
signature, not a Bearer JWT — signature verification still happens
downstream in `WebhooksController`). The webhook exemption route must stay
declared above the generic `integration/*` wildcard route because Express
matches routes in declaration order, not specificity. The gateway's shared
`proxy()` helper also now rejects directory-traversal sequences (raw,
percent-encoded, double-encoded, and backslash forms) in the proxied path
before constructing the outbound URL, closing a bypass where a request could
match a `@Public()` route pattern while carrying a `..` segment that the
downstream URL parser would later collapse into a different, guarded route.
Alongside this, structured JSON logging (pino-backed, via
`LoggingInterceptor` and the new `LoggingExceptionFilter` backstop) was wired
into `api-gateway` and `auth-service` for the first time, and log output
across all four services now carries `traceId`/`spanId` (from OTel span
context) and `userId` in addition to the existing fields.

## Why

Before this change, `api-gateway` provided `JwtAuthGuard` in its DI graph
but never bound it as a global guard — `request.user` was always
`undefined` at the gateway, and enforcement existed only in each downstream
service. This meant an unauthenticated or malformed request would be
proxied all the way to a downstream service before being rejected, and the
gateway's own logs could never carry `organizationId`/`userId` for
correlation. Enforcing JWT auth at the gateway closes that gap: rejection
now happens at the edge, and gateway logs can be correlated with downstream
logs via `userId`/`organizationId`/`traceId`.

## Alternatives Considered

- **Leave enforcement downstream-only:** Rejected. Downstream-only
  enforcement means every service must independently get guard wiring
  right, and the gateway's own request logs can never carry meaningful
  `userId`/`organizationId` for the first hop of a request's lifecycle.
- **Enforce JWT at the gateway but drop downstream validation:** Rejected.
  Downstream services are still directly reachable in some deployment
  topologies and by internal callers; removing their independent validation
  would weaken defense-in-depth for a logging/architecture change that
  doesn't require it.
- **Exempt the webhook route by pattern-matching on header presence instead
  of a dedicated `@Public()` route:** Rejected as more fragile — a
  dedicated route declared above the generic wildcard is explicit and
  order-safe, whereas header-sniffing inside the guard would couple the
  generic auth guard to one integration's webhook contract.

## Impact

- API consumers: no change to the JWT requirement itself (downstream
  services already required a valid token for these endpoints) — requests
  now fail with a 401 one hop earlier, at the gateway, instead of at the
  downstream service.
- GitHub webhook deliveries: unaffected — the exemption preserves the
  existing HMAC-signature-based flow.
- Anyone extending `gateway.controller.ts`: new `@Public()` proxy routes
  added to the gateway must be declared above any generic wildcard route
  they could otherwise be shadowed by, per Express's declaration-order route
  matching.
- Log consumers: gateway and auth-service logs now exist and carry the same
  structured shape (`traceId`, `spanId`, `userId`, `organizationId`,
  `requestId`, `durationMs`) as the other two services; dashboards/alerts
  built only against core-service/evaluation-service logs can now be
  extended to the gateway and auth-service.
- Docs updated alongside this decision: `README.md` (service
  responsibility table) and `docs/ARCHITECTURE.md` (API Gateway section,
  Structured Logging section).
