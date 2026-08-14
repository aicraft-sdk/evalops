/**
 * App-boot smoke test proving the full production NestJS module graph
 * (`AppModule`) resolves and initializes without a DI wiring error.
 *
 * This is a REGRESSION test for a real bug: `PrDecorationService` (declared
 * inside `PrDecorationModule`, an app-imported library module) depends on
 * `RUN_LOOKUP`, but `{ provide: RUN_LOOKUP, useExisting: RunsService }` was
 * bound in `AppModule`'s OWN `providers:` array — NestJS scopes non-
 * `@Global()` providers per-module, so a binding declared in a PARENT
 * module's own `providers:` array is NOT automatically visible inside a
 * CHILD module it imports. Booting the compiled app crashed with:
 * `UnknownDependenciesException: Nest can't resolve dependencies of the
 * PrDecorationService (?). Please make sure that the argument
 * Symbol(RUN_LOOKUP) at index [0] is available in the PrDecorationModule
 * context.`
 *
 * Neither existing test type in this codebase catches this class of bug:
 * `ee/pr-decoration/src/lib/pr-decoration.service.spec.ts` hand-constructs
 * `PrDecorationService` directly (`new PrDecorationService(runsService as
 * never)`), bypassing Nest's DI container entirely; and
 * `calibration.http-e2e.spec.ts` (same app, `evaluation/calibration/`
 * directory) explicitly documents that it boots only a hand-picked module
 * subset (ConfigModule, PassportModule, SharedDbModule, GoldenSetsModule)
 * that excludes `RunsModule`/`PrDecorationModule` altogether.
 *
 * This test boots the REAL, unmodified `AppModule` — the exact module graph
 * `main.ts` passes to `NestFactory.create()` — proving the full production
 * wiring resolves and initializes. `LicenseModule.forRoot()` does register an
 * `OnModuleInit` hook (`EntitlementService.onModuleInit()`,
 * `libs/licensing/src/lib/entitlement.service.ts`), but it only does a
 * synchronous, try/catch-guarded local file read — no database query or
 * network I/O — so `DATABASE_URL` only needs to be syntactically present for
 * `pg.Pool`'s constructor (which connects lazily, see `@evalops/shared-db`'s
 * `db.ts`) — no live Postgres server is required for this test to prove the
 * DI graph resolves.
 *
 * `DATABASE_URL`/`JWT_SECRET`/`OPENAI_API_KEY` must be set BEFORE any
 * `require()` of `AppModule` (it transitively, statically imports
 * `@evalops/shared-db`, which reads `DATABASE_URL` at module-load time) —
 * mirrors `calibration.http-e2e.spec.ts`'s require()-after-env-setup
 * pattern exactly; plain top-level ES `import` statements are hoisted above
 * this file's env assignments and would run against the wrong/unset env.
 */
process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-secret-for-app-boot-smoke-test';
// AIProviderService's constructor eagerly builds a real OpenAI client and
// throws if no API key is configured. generateResponse() is never called by
// this test, so the key value itself is irrelevant.
process.env['OPENAI_API_KEY'] =
  process.env['OPENAI_API_KEY'] ?? 'test-key-not-used-by-this-boot-smoke-test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppModule } = require('./app.module');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrDecorationService } = require('@evalops/ee-pr-decoration');

describe('AppModule boot (real NestJS DI graph, no mocked/overridden providers)', () => {
  jest.setTimeout(30000);

  it('resolves and initializes the full production module graph without a DI wiring error', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    try {
      // Proves PrDecorationService's RUN_LOOKUP dependency actually
      // resolved (this is the exact provider that threw
      // UnknownDependenciesException before the fix) -- PrDecorationController/
      // PrDecorationService must be declared directly in AppModule's own
      // controllers/providers arrays, co-located with the
      // `{ provide: RUN_LOOKUP, useExisting: RunsService }` binding.
      const prDecorationService = app.get(PrDecorationService);
      expect(prDecorationService).toBeInstanceOf(PrDecorationService);
    } finally {
      await app.close();
    }
  });
});
