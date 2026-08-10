import { Injectable } from '@nestjs/common';
import { db } from '../db';
import {
  cicdIntegrations,
  cicdRuns,
  webhookEvents,
  runs,
  policyViolations,
} from '../schema';
import { eq, desc } from 'drizzle-orm';

// Insert (full-row) payloads are built from $inferSelect — required columns
// picked explicitly, everything else (auto-generated or DB-defaulted)
// optional — never $inferInsert directly, and update (partial) payloads
// use plain Partial<$inferSelect>: drizzle's $inferInsert conditional
// types (NotNull/HasDefault branding) silently collapse to only the
// required columns (dropping optional/nullable columns from the type
// entirely, with or without Partial<>) when compiled under
// strictNullChecks: false — which every backend app's tsconfig uses today
// (only shared-db's own tsconfig sets strict: true). $inferSelect does not
// depend on that branding and stays fully typed either way. See
// runs.repository.update-types.spec.ts / agents.repository.ts for the
// reproduction.
type CreateCicdRunData = Pick<
  typeof cicdRuns.$inferSelect,
  'integrationId' | 'organizationId'
> &
  Partial<Omit<typeof cicdRuns.$inferSelect, 'integrationId' | 'organizationId'>>;

type UpdateCicdRunData = Partial<typeof cicdRuns.$inferSelect>;

type CreateWebhookEventData = Pick<
  typeof webhookEvents.$inferSelect,
  'integrationId' | 'eventType' | 'payload' | 'organizationId'
> &
  Partial<
    Omit<
      typeof webhookEvents.$inferSelect,
      'integrationId' | 'eventType' | 'payload' | 'organizationId'
    >
  >;

@Injectable()
export class CicdRepository {
  // CI/CD Integrations
  async findIntegrationsByOrg(
    organizationId: string,
  ): Promise<(typeof cicdIntegrations.$inferSelect)[]> {
    return db
      .select()
      .from(cicdIntegrations)
      .where(eq(cicdIntegrations.organizationId, organizationId))
      .orderBy(desc(cicdIntegrations.createdAt));
  }

  async createIntegration(
    data: typeof cicdIntegrations.$inferInsert,
  ): Promise<typeof cicdIntegrations.$inferSelect> {
    const [integration] = await db
      .insert(cicdIntegrations)
      .values(data)
      .returning();
    return integration;
  }

  async findIntegrationById(
    id: string,
  ): Promise<typeof cicdIntegrations.$inferSelect | undefined> {
    const [integration] = await db
      .select()
      .from(cicdIntegrations)
      .where(eq(cicdIntegrations.id, id))
      .limit(1);
    return integration;
  }

  // CI/CD Runs
  async createRun(
    data: CreateCicdRunData,
  ): Promise<typeof cicdRuns.$inferSelect> {
    const [run] = await db.insert(cicdRuns).values([data]).returning();
    return run;
  }

  async findRunById(
    id: string,
  ): Promise<typeof cicdRuns.$inferSelect | undefined> {
    const [run] = await db
      .select()
      .from(cicdRuns)
      .where(eq(cicdRuns.id, id))
      .limit(1);
    return run;
  }

  async updateRun(
    id: string,
    data: UpdateCicdRunData,
  ): Promise<typeof cicdRuns.$inferSelect | undefined> {
    const [run] = await db
      .update(cicdRuns)
      .set(data)
      .where(eq(cicdRuns.id, id))
      .returning();
    return run;
  }

  // Webhook Events
  async createWebhookEvent(
    data: CreateWebhookEventData,
  ): Promise<typeof webhookEvents.$inferSelect> {
    const [event] = await db
      .insert(webhookEvents)
      .values([data])
      .returning();
    return event;
  }

  /**
   * Atomically creates a webhook event record and its associated CI/CD run.
   *
   * If createRun fails after createWebhookEvent has succeeded, the webhook event
   * would be left orphaned with no corresponding CI/CD run — an inconsistent
   * audit trail. Wrapping both inserts in a transaction prevents that.
   */
  async createRunWithWebhookEvent(
    webhookData: CreateWebhookEventData,
    runData: CreateCicdRunData,
  ): Promise<{
    event: typeof webhookEvents.$inferSelect;
    run: typeof cicdRuns.$inferSelect;
  }> {
    return db.transaction(async (tx) => {
      const [event] = await tx
        .insert(webhookEvents)
        .values([webhookData])
        .returning();

      const [run] = await tx.insert(cicdRuns).values([runData]).returning();

      return { event, run };
    });
  }

  // Eval Runs (for alert checks — cross-module query)
  async findEvalRunById(
    runId: string,
  ): Promise<typeof runs.$inferSelect | undefined> {
    const [run] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    return run;
  }

  async findEvalRunsByOrg(
    organizationId: string,
    limit = 1000,
  ): Promise<(typeof runs.$inferSelect)[]> {
    return db
      .select()
      .from(runs)
      .where(eq(runs.organizationId, organizationId))
      .orderBy(desc(runs.createdAt))
      .limit(limit);
  }

  async findEvalRunsByEvalSpec(
    evalSpecId: string,
  ): Promise<(typeof runs.$inferSelect)[]> {
    return db
      .select()
      .from(runs)
      .where(eq(runs.evalSpecId, evalSpecId))
      .orderBy(desc(runs.createdAt));
  }

  async findPolicyViolationsByRun(
    runId: string,
  ): Promise<(typeof policyViolations.$inferSelect)[]> {
    return db
      .select()
      .from(policyViolations)
      .where(eq(policyViolations.runId, runId));
  }
}
