import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

/**
 * Structural interface for the app-owned RunsService, mirroring the SSO_USER_PROVISIONER
 * DI-token pattern from ee/sso: a lib must never have a compile-time import of anything
 * inside an app, so this declares only the shape ee/pr-decoration needs and lets
 * TypeScript's structural typing satisfy it without importing the concrete class.
 */
export interface RunLookup {
  getRun(id: string): Promise<{ id: string; organizationId: string; name?: string | null; decision?: string | null }>;
}

export const RUN_LOOKUP = Symbol('RUN_LOOKUP');

@Injectable()
export class PrDecorationService {
  constructor(@Inject(RUN_LOOKUP) private readonly runLookup: RunLookup) {}

  async buildDecoration(organizationId: string, runId: string) {
    const run = await this.runLookup.getRun(runId);
    if (run.organizationId !== organizationId) {
      throw new ForbiddenException('Run belongs to a different organization');
    }
    return {
      entitled: true,
      scenarios: [{ name: run.name ?? run.id, decision: run.decision ?? 'pass' }],
    };
  }
}
