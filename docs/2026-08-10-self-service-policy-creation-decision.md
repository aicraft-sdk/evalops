# Self-Service Policy Creation API

## What Changed

`apps/evaluation-service/src/app/policies/policies.controller.ts` gained three new endpoints
— `POST /policies`, `PUT /policies/:id`, `DELETE /policies/:id` (all under the gateway's
`/api/evaluation/*` prefix, i.e. `/api/evaluation/policies`) — alongside the pre-existing
`GET /policies` and `POST /policies/evaluate/:runId`. All three new routes are gated by
`JwtAuthGuard` + `RbacGuard` with `@Roles(UserRole.ORG_ADMIN, UserRole.ADMIN)`, and every
service-layer call (`PoliciesService.createPolicy/updatePolicy/deletePolicy`, backed by
`RunsRepository`) is scoped to `user.organizationId` so one org can never read, modify, or
delete another org's policies. Request bodies are validated by two new DTOs
(`CreatePolicyDto`, `UpdatePolicyDto` in `policies.dto.ts`) using `class-validator` with
`whitelist: true, forbidNonWhitelisted: true`, including a custom cross-field constraint
(`IsThresholdShapeValidForOperator`) that rejects a `PolicyRuleDto.threshold` shape
(scalar vs. `[number, number]` tuple) that doesn't match its sibling `operator` — e.g. a
tuple threshold with `operator: 'equals'`, or a scalar threshold with `operator: 'between'`
— since either mismatch previously would have passed validation and then silently produced
an always/never-firing or permanently inert policy gate at evaluation time with no error
anywhere in that path (commits `6a578c4`, `730ba7b`).

## Why

Policy creation was previously SQL-only: a policy could only be inserted directly into the
`policies` table, confirmed live during an earlier end-to-end verification pass
(`POST /api/policies` returned 404). This was flagged as a real, launch-relevant gap for a
self-host release — admins had no way to define pass/warn/fail gates without direct
database access, which is not a viable workflow for the product's target self-service
audience. Closing it required a real REST surface with the same RBAC/tenant-isolation
guarantees the rest of the API already enforces, not just an unguarded CRUD shim.

## Alternatives Considered

- **Reuse the existing `GET /policies` handler's implicit trust model with no extra RBAC
  check:** Rejected. `GET /policies` only reads within the caller's org; write operations
  (create/update/delete) are higher-blast-radius and need an explicit role check, not just
  org-scoping, since a `member`/`viewer` role should not be able to redefine deployment
  gates for their whole org.
- **Skip the cross-field threshold/operator validator and rely on `checkThreshold()` to
  fail gracefully at evaluation time:** Rejected. `checkThreshold()` has no error path for
  a shape mismatch — it silently returns a wrong-but-valid boolean (always/never-violating),
  which is worse than a rejected request at creation time: a broken gate would look "active"
  in the UI while never actually blocking (or always blocking) deployments, with nothing in
  logs to explain why.
- **Validate threshold/operator shape only in the service layer, not the DTO:** Rejected in
  favor of a `class-validator` decorator (`IsThresholdShapeValidForOperator`) so the
  mismatch is rejected as a 400 at the API boundary, consistent with how every other field
  on `CreatePolicyDto`/`UpdatePolicyDto` is validated, and covered by the same
  `ValidationPipe` used elsewhere in this controller.

## Impact

- **API consumers / admins:** Policies can now be created, updated, and deleted via
  `POST`/`PUT`/`DELETE /api/evaluation/policies(/:id)` by any user with `org_admin` or
  `admin` role, scoped to their own organization. No schema or migration change was
  required — only new controller routes, DTOs, and service methods on top of the existing
  `policies` table and `RunsRepository`.
- **Docs updated alongside this decision:** `README.md` (API Overview table — evaluation
  service example endpoints), `docs/ARCHITECTURE.md` (Evaluation Service section's Policy
  engine bullet).
- **Migration steps:** None. Any policy previously seeded via direct SQL continues to work
  unchanged; the new endpoints are purely additive.
- **Ongoing maintenance:** `IsThresholdShapeValidForOperator`'s operator/shape rules
  (`equals`/`not_equals` reject tuples, `between` requires a tuple) must stay in sync with
  `checkThreshold()` in `policies.service.ts` if new operators are ever added — a new
  operator with no matching case in either place would silently reopen the same class of
  inert-gate bug this change closed.
