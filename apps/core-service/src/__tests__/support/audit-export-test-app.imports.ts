/**
 * Deliberately a separate file with plain, static top-level imports (rather than inline
 * in `audit-export-entitlement.integration.test.ts`), for two reasons:
 *
 *  1. `EVALOPS_DEV_MODE` must be set as an env var BEFORE `@evalops/shared-db` (and
 *     anything transitively importing it, like `@evalops/ee-audit-export`) is first
 *     required. The test file sets that env var, then only `require()`s this file
 *     afterwards — Node evaluates a file's body at the exact point it is first
 *     `require()`d, so this file's own imports are guaranteed to run after the env var
 *     is already set, regardless of source order within this file.
 *  2. `apps/core-service` is one of this repo's authorized `ee/*` composition roots
 *     (see `ee/README.md`); a plain static `import` of `@evalops/ee-audit-export` here
 *     is the normal, boundary-safe way to reference it — unlike a `require('@evalops/
 *     ee-audit-export')` call, which this repo's `no-restricted-syntax` lint rule
 *     deliberately flags as bypassing `@nx/enforce-module-boundaries` (that rule only
 *     inspects static `import` AST nodes, not `require()` calls).
 */
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { SharedDbModule } from '@evalops/shared-db';
import { JwtAuthGuard } from '@evalops/shared-auth';
import { LicenseModule } from '@evalops/licensing';
import { CoreAnalyticsModule } from '@evalops/core-analytics';
import { AuditExportModule } from '@evalops/ee-audit-export';
import { JwtStrategy } from '../../app/jwt.strategy';

export function auditExportTestAppModuleMetadata(publicKeyPem: string) {
  return {
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PassportModule,
      SharedDbModule,
      LicenseModule.forRoot({ publicKeyPem }),
      CoreAnalyticsModule,
      AuditExportModule,
    ],
    providers: [JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  };
}
