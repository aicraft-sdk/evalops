import { Injectable, BadRequestException } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  runs,
  baselines,
  policies,
  policyViolations,
  sampleResults,
  runAnnotations,
  reviewQueueItems,
  customEvaluators,
  evaluatorUsage,
  type Run,
  type InsertRun,
  type Baseline,
  type InsertBaseline,
  type Policy,
  type InsertPolicy,
  type PolicyViolation,
  type InsertPolicyViolation,
  type SampleResult,
  type InsertSampleResult,
  type RunAnnotation,
  type InsertRunAnnotation,
  type ReviewQueueItem,
  type InsertReviewQueueItem,
  type CustomEvaluator,
  type EvaluatorUsage,
  type InsertEvaluatorUsage,
} from '@evalops/shared-db';
import { eq, desc, and, sql, or, inArray } from 'drizzle-orm';

const TRACE_EVENTS_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class DatabaseStorageService {
  // Run operations
  async getRuns(organizationId: string, limit = 50): Promise<Run[]> {
    return await db
      .select()
      .from(runs)
      .where(eq(runs.organizationId, organizationId))
      .orderBy(desc(runs.createdAt))
      .limit(limit);
  }

  async getRun(id: string): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    return run;
  }

  async createRun(run: InsertRun): Promise<Run> {
    const [newRun] = await db.insert(runs).values([run]).returning();
    return newRun;
  }

  async updateRun(id: string, run: Partial<InsertRun>): Promise<Run> {
    const [updatedRun] = await db
      .update(runs)
      .set(run)
      .where(eq(runs.id, id))
      .returning();
    return updatedRun;
  }

  async getRunsByEvalSpec(evalSpecId: string): Promise<Run[]> {
    return await db
      .select()
      .from(runs)
      .where(eq(runs.evalSpecId, evalSpecId))
      .orderBy(desc(runs.createdAt));
  }

  // Baseline operations
  async getBaselines(organizationId: string): Promise<Baseline[]> {
    return await db
      .select()
      .from(baselines)
      .where(eq(baselines.organizationId, organizationId))
      .orderBy(desc(baselines.createdAt));
  }

  async getBaseline(id: string): Promise<Baseline | undefined> {
    const [baseline] = await db
      .select()
      .from(baselines)
      .where(eq(baselines.id, id));
    return baseline;
  }

  async createBaseline(baseline: InsertBaseline): Promise<Baseline> {
    const [newBaseline] = await db
      .insert(baselines)
      .values([baseline])
      .returning();
    return newBaseline;
  }

  async getActiveBaseline(evalSpecId: string): Promise<Baseline | undefined> {
    const [baseline] = await db
      .select()
      .from(baselines)
      .where(
        and(eq(baselines.evalSpecId, evalSpecId), eq(baselines.isActive, true))
      )
      .orderBy(desc(baselines.createdAt))
      .limit(1);
    return baseline;
  }

  // Policy operations
  async getPolicies(organizationId: string): Promise<Policy[]> {
    return await db
      .select()
      .from(policies)
      .where(eq(policies.organizationId, organizationId))
      .orderBy(desc(policies.createdAt));
  }

  async getPolicy(id: string): Promise<Policy | undefined> {
    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.id, id));
    return policy;
  }

  async getActivePolicies(organizationId: string): Promise<Policy[]> {
    return await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.organizationId, organizationId),
          eq(policies.isActive, true)
        )
      );
  }

  // Policy Violation operations
  async createPolicyViolation(
    violation: InsertPolicyViolation
  ): Promise<PolicyViolation> {
    const [newViolation] = await db
      .insert(policyViolations)
      .values(violation)
      .returning();
    return newViolation;
  }

  async getPolicyViolationsByRun(runId: string): Promise<PolicyViolation[]> {
    return await db
      .select()
      .from(policyViolations)
      .where(eq(policyViolations.runId, runId));
  }

  // Sample Results operations
  async createSampleResult(
    sampleResult: InsertSampleResult
  ): Promise<SampleResult> {
    const [newSampleResult] = await db
      .insert(sampleResults)
      .values(sampleResult)
      .returning();
    return newSampleResult;
  }

  async getSampleResults(runId: string): Promise<SampleResult[]> {
    return await db
      .select()
      .from(sampleResults)
      .where(eq(sampleResults.runId, runId))
      .orderBy(sampleResults.sampleIndex, sampleResults.repetition);
  }

  async appendTraceEvents(runId: string, events: unknown[]): Promise<void> {
    // Guard: check current trace_events size before appending
    const [current] = await db
      .select({ traceEvents: runs.traceEvents })
      .from(runs)
      .where(eq(runs.id, runId));

    if (current) {
      const currentSize = JSON.stringify(current.traceEvents ?? []).length;
      const incomingSize = JSON.stringify(events).length;
      if (currentSize + incomingSize > TRACE_EVENTS_MAX_BYTES) {
        throw new BadRequestException(
          `trace_events would exceed the 10 MB limit for run ${runId}`
        );
      }
    }

    await db.execute(
      sql`UPDATE runs
          SET trace_events = COALESCE(trace_events, '[]'::jsonb) || ${JSON.stringify(
            events
          )}::jsonb
          WHERE id = ${runId}`
    );
  }

  async updateRunStatus(runId: string, status: string): Promise<void> {
    const updateData: Partial<InsertRun> = {
      status,
    };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }
    await db.update(runs).set(updateData).where(eq(runs.id, runId));
  }

  async updateRunArtifacts(
    runId: string,
    artifactHashes: Record<string, string>
  ): Promise<void> {
    await db
      .update(runs)
      .set({ artifactHashes } as Partial<InsertRun>)
      .where(eq(runs.id, runId));
  }

  // Run Annotation operations
  async createAnnotation(
    annotation: InsertRunAnnotation
  ): Promise<RunAnnotation> {
    const [newAnnotation] = await db
      .insert(runAnnotations)
      .values(annotation)
      .returning();
    return newAnnotation;
  }

  async getAnnotation(id: string): Promise<RunAnnotation | undefined> {
    const [annotation] = await db
      .select()
      .from(runAnnotations)
      .where(eq(runAnnotations.id, id));
    return annotation;
  }

  async getAnnotationsForRun(
    runId: string,
    spanId?: string
  ): Promise<RunAnnotation[]> {
    const conditions = [eq(runAnnotations.runId, runId)];
    if (spanId) {
      conditions.push(eq(runAnnotations.spanId, spanId));
    }
    return await db
      .select()
      .from(runAnnotations)
      .where(and(...conditions))
      .orderBy(desc(runAnnotations.createdAt));
  }

  async updateAnnotation(
    id: string,
    annotation: Partial<InsertRunAnnotation>
  ): Promise<RunAnnotation> {
    const updateData: Partial<InsertRunAnnotation> = {
      ...annotation,
      updatedAt: new Date(),
    };
    const [updated] = await db
      .update(runAnnotations)
      .set(updateData)
      .where(eq(runAnnotations.id, id))
      .returning();
    return updated;
  }

  async deleteAnnotation(id: string): Promise<void> {
    await db.delete(runAnnotations).where(eq(runAnnotations.id, id));
  }

  // Review Queue Item operations
  async createReviewQueueItem(
    item: InsertReviewQueueItem
  ): Promise<ReviewQueueItem> {
    const [newItem] = await db
      .insert(reviewQueueItems)
      .values(item)
      .returning();
    return newItem;
  }

  async getReviewQueueItem(id: string): Promise<ReviewQueueItem | undefined> {
    const [item] = await db
      .select()
      .from(reviewQueueItems)
      .where(eq(reviewQueueItems.id, id));
    return item;
  }

  async getReviewQueueItems(
    organizationId: string,
    filters?: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      sourceType?: string;
      tags?: string[];
    },
    limit = 50
  ): Promise<ReviewQueueItem[]> {
    const conditions: any[] = [
      eq(reviewQueueItems.organizationId, organizationId),
    ];

    if (filters?.status) {
      conditions.push(eq(reviewQueueItems.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(reviewQueueItems.priority, filters.priority));
    }
    if (filters?.assigneeId) {
      conditions.push(eq(reviewQueueItems.assigneeId, filters.assigneeId));
    }
    if (filters?.sourceType) {
      conditions.push(eq(reviewQueueItems.sourceType, filters.sourceType));
    }
    if (filters?.tags && filters.tags.length > 0) {
      // Filter by tags using JSONB containment
      conditions.push(
        sql`${reviewQueueItems.tags} @> ${JSON.stringify(filters.tags)}::jsonb`
      );
    }

    return await db
      .select()
      .from(reviewQueueItems)
      .where(and(...conditions))
      .orderBy(desc(reviewQueueItems.createdAt))
      .limit(limit);
  }

  async updateReviewQueueItem(
    id: string,
    item: Partial<InsertReviewQueueItem>
  ): Promise<ReviewQueueItem> {
    const updateData: any = { ...item, updatedAt: new Date() };
    if (
      item.status === 'fixed' ||
      item.status === 'dismissed' ||
      item.status === 'promoted'
    ) {
      updateData.resolvedAt = new Date();
    }
    const [updated] = await db
      .update(reviewQueueItems)
      .set(updateData)
      .where(eq(reviewQueueItems.id, id))
      .returning();
    return updated;
  }

  // Custom Evaluator operations
  async getCustomEvaluator(id: string): Promise<CustomEvaluator | undefined> {
    const [evaluator] = await db
      .select()
      .from(customEvaluators)
      .where(eq(customEvaluators.id, id))
      .limit(1);
    return evaluator;
  }

  // Evaluator Usage operations
  async createEvaluatorUsage(
    usage: InsertEvaluatorUsage
  ): Promise<EvaluatorUsage> {
    const [newUsage] = await db
      .insert(evaluatorUsage)
      .values(usage)
      .returning();
    return newUsage;
  }
}
