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
    data: Record<string, unknown>,
  ): Promise<typeof cicdRuns.$inferSelect> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [run] = await db.insert(cicdRuns).values(data as any).returning();
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
    data: Record<string, unknown>,
  ): Promise<typeof cicdRuns.$inferSelect | undefined> {
    const [run] = await db
      .update(cicdRuns)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(data as any)
      .where(eq(cicdRuns.id, id))
      .returning();
    return run;
  }

  // Webhook Events
  async createWebhookEvent(
    data: Record<string, unknown>,
  ): Promise<typeof webhookEvents.$inferSelect> {
    const [event] = await db
      .insert(webhookEvents)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
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
    webhookData: Record<string, unknown>,
    runData: Record<string, unknown>,
  ): Promise<{
    event: typeof webhookEvents.$inferSelect;
    run: typeof cicdRuns.$inferSelect;
  }> {
    return db.transaction(async (tx) => {
      const [event] = await tx
        .insert(webhookEvents)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(webhookData as any)
        .returning();

      const [run] = await tx
        .insert(cicdRuns)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(runData as any)
        .returning();

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
