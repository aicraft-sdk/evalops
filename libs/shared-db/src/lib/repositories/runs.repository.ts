import { Injectable, BadRequestException } from '@nestjs/common';
import { db } from '../db';
import { runs, baselines, policies, policyViolations } from '../schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const TRACE_EVENTS_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class RunsRepository {
  async findAllByOrg(
    organizationId: string,
    limit = 50,
  ): Promise<(typeof runs.$inferSelect)[]> {
    return db
      .select()
      .from(runs)
      .where(eq(runs.organizationId, organizationId))
      .orderBy(desc(runs.createdAt))
      .limit(limit);
  }

  async findById(
    id: string,
  ): Promise<typeof runs.$inferSelect | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    return run;
  }

  async findByEvalSpec(
    evalSpecId: string,
  ): Promise<(typeof runs.$inferSelect)[]> {
    return db
      .select()
      .from(runs)
      .where(eq(runs.evalSpecId, evalSpecId))
      .orderBy(desc(runs.createdAt));
  }

  async create(
    data: typeof runs.$inferInsert,
  ): Promise<typeof runs.$inferSelect> {
    const [run] = await db.insert(runs).values([data]).returning();
    return run;
  }

  // NOTE: uses $inferSelect (not $inferInsert, unlike create() above) because
  // drizzle's $inferInsert conditional types (NotNull/HasDefault branding)
  // silently collapse to only the required columns when compiled under
  // strictNullChecks: false — which every backend app's tsconfig uses today
  // (only shared-db's own tsconfig sets strict: true). $inferSelect does not
  // depend on that branding and stays fully typed either way, so it is the
  // correct choice for a partial-update payload. See runs.repository.ts git
  // history / workflow notes for the reproduction.
  async update(
    id: string,
    data: Partial<typeof runs.$inferSelect>,
  ): Promise<typeof runs.$inferSelect | undefined> {
    const [run] = await db
      .update(runs)
      .set(data)
      .where(eq(runs.id, id))
      .returning();
    return run;
  }

  /**
   * Atomically marks a run as completed and stores its artifact hashes.
   * Both updates run inside a single Drizzle transaction so the run is never
   * left in status='completed' without artifact hashes (or vice versa) if one
   * of the writes fails.
   */
  async completeRun(
    id: string,
    artifactHashes: Record<string, string>,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Partial<$inferSelect> — see the note on update() above for why
      // $inferInsert is not used here.
      const completionData: Partial<typeof runs.$inferSelect> = {
        status: 'completed',
        completedAt: new Date(),
      };
      await tx
        .update(runs)
        .set(completionData)
        .where(eq(runs.id, id));
      await tx
        .update(runs)
        .set({ artifactHashes } as Partial<typeof runs.$inferInsert>)
        .where(eq(runs.id, id));
    });
  }

  async updateStatus(runId: string, status: string): Promise<void> {
    // Partial<$inferSelect> — see the note on update() above for why
    // $inferInsert is not used here.
    const updateData: Partial<typeof runs.$inferSelect> = { status };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }
    await db.update(runs).set(updateData).where(eq(runs.id, runId));
  }

  async updateArtifacts(
    runId: string,
    artifactHashes: Record<string, string>,
  ): Promise<void> {
    await db
      .update(runs)
      .set({ artifactHashes } as Partial<typeof runs.$inferInsert>)
      .where(eq(runs.id, runId));
  }

  async appendTraceEvents(runId: string, events: unknown[]): Promise<void> {
    const [current] = await db
      .select({ traceEvents: runs.traceEvents })
      .from(runs)
      .where(eq(runs.id, runId));

    if (current) {
      const currentSize = JSON.stringify(current.traceEvents ?? []).length;
      const incomingSize = JSON.stringify(events).length;
      if (currentSize + incomingSize > TRACE_EVENTS_MAX_BYTES) {
        throw new BadRequestException(
          `trace_events would exceed the 10 MB limit for run ${runId}`,
        );
      }
    }

    await db.execute(
      sql`UPDATE runs
          SET trace_events = COALESCE(trace_events, '[]'::jsonb) || ${JSON.stringify(
            events,
          )}::jsonb
          WHERE id = ${runId}`,
    );
  }

  // Baselines
  async findBaselinesByOrg(
    organizationId: string,
  ): Promise<(typeof baselines.$inferSelect)[]> {
    return db
      .select()
      .from(baselines)
      .where(eq(baselines.organizationId, organizationId))
      .orderBy(desc(baselines.createdAt));
  }

  async findBaselineById(
    id: string,
  ): Promise<typeof baselines.$inferSelect | undefined> {
    const [baseline] = await db
      .select()
      .from(baselines)
      .where(eq(baselines.id, id));
    return baseline;
  }

  async createBaseline(
    data: typeof baselines.$inferInsert,
  ): Promise<typeof baselines.$inferSelect> {
    const [baseline] = await db
      .insert(baselines)
      .values([data])
      .returning();
    return baseline;
  }

  async findActiveBaseline(
    evalSpecId: string,
  ): Promise<typeof baselines.$inferSelect | undefined> {
    const [baseline] = await db
      .select()
      .from(baselines)
      .where(
        and(
          eq(baselines.evalSpecId, evalSpecId),
          eq(baselines.isActive, true),
        ),
      )
      .orderBy(desc(baselines.createdAt))
      .limit(1);
    return baseline;
  }

  // Policies
  async findPoliciesByOrg(
    organizationId: string,
  ): Promise<(typeof policies.$inferSelect)[]> {
    return db
      .select()
      .from(policies)
      .where(eq(policies.organizationId, organizationId))
      .orderBy(desc(policies.createdAt));
  }

  async findPolicyById(
    id: string,
  ): Promise<typeof policies.$inferSelect | undefined> {
    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.id, id));
    return policy;
  }

  async findActivePolicies(
    organizationId: string,
  ): Promise<(typeof policies.$inferSelect)[]> {
    return db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.organizationId, organizationId),
          eq(policies.isActive, true),
        ),
      );
  }

  // Policy Violations
  async createPolicyViolation(
    data: Record<string, unknown>,
  ): Promise<typeof policyViolations.$inferSelect> {
    const [violation] = await db
      .insert(policyViolations)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
      .returning();
    return violation;
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
