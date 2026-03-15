import { Injectable } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  auditTrail,
  runs,
  evalSpecs,
  users,
  modelUsage,
  models,
  type AuditTrail,
  type EnhancedAuditEntry,
} from '@evalops/shared-db';
import { datasets, prompts } from '@evalops/shared-db';
import { eq, desc, and, sql, count, gte, lte, avg, sum } from 'drizzle-orm';

@Injectable()
export class DatabaseStorageService {
  async getAuditTrail(
    organizationId: string,
    limit = 100,
  ): Promise<AuditTrail[]> {
    return await db
      .select()
      .from(auditTrail)
      .where(eq(auditTrail.organizationId, organizationId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit);
  }

  async getAuditTrailEnhanced(
    organizationId: string,
    limit = 100,
  ): Promise<EnhancedAuditEntry[]> {
    const entries = await db
      .select({
        id: auditTrail.id,
        action: auditTrail.action,
        entityType: auditTrail.entityType,
        entityId: auditTrail.entityId,
        changes: auditTrail.changes,
        organizationId: auditTrail.organizationId,
        userId: auditTrail.userId,
        createdAt: auditTrail.createdAt,
        userName: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(auditTrail)
      .leftJoin(users, eq(auditTrail.userId, users.id))
      .where(eq(auditTrail.organizationId, organizationId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit);

    // Enhance with entity names
    const enhancedEntries = await Promise.all(
      entries.map(async (entry) => {
        let entityName = 'Unknown';

        try {
          switch (entry.entityType) {
            case 'dataset':
              if (entry.entityId) {
                const [dataset] = await db
                  .select({ name: datasets.name })
                  .from(datasets)
                  .where(eq(datasets.id, entry.entityId))
                  .limit(1);
                entityName = dataset?.name || 'Unknown';
              }
              break;
            case 'prompt':
              if (entry.entityId) {
                const [prompt] = await db
                  .select({ name: prompts.name })
                  .from(prompts)
                  .where(eq(prompts.id, entry.entityId))
                  .limit(1);
                entityName = prompt?.name || 'Unknown';
              }
              break;
            case 'eval_spec':
              if (entry.entityId) {
                const spec = await this.getEvalSpec(entry.entityId);
                entityName = spec?.name || 'Unknown';
              }
              break;
            case 'run':
              if (entry.entityId) {
                const [run] = await db
                  .select({ name: runs.name })
                  .from(runs)
                  .where(eq(runs.id, entry.entityId))
                  .limit(1);
                entityName = run?.name || 'Unknown';
              }
              break;
            default:
              entityName = entry.entityId || 'Unknown';
          }
        } catch (error) {
          // If entity lookup fails, keep 'Unknown'
          entityName = 'Unknown';
        }

        return {
          ...entry,
          entityName,
          description: `${entry.action} ${entry.entityType}${entityName !== 'Unknown' ? `: ${entityName}` : ''}`,
        } as EnhancedAuditEntry;
      }),
    );

    return enhancedEntries;
  }

  async getTrends(organizationId: string, days: number): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const runsData = await db
      .select({
        date: sql<string>`DATE(${runs.startedAt})`,
        status: runs.status,
        decision: runs.decision,
        cost: runs.cost,
        duration: runs.duration,
      })
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, organizationId),
          gte(runs.startedAt, startDate),
        ),
      );

    // Group by date and calculate metrics
    const dailyMetrics = new Map<string, any>();

    for (const run of runsData) {
      const date = run.date as string;
      if (!dailyMetrics.has(date)) {
        dailyMetrics.set(date, {
          date,
          totalRuns: 0,
          completedRuns: 0,
          passedRuns: 0,
          failedRuns: 0,
          totalCost: 0,
          durations: [],
        });
      }

      const dayData = dailyMetrics.get(date);
      dayData.totalRuns++;

      if (run.status === 'completed') {
        dayData.completedRuns++;
        if (run.decision === 'pass') dayData.passedRuns++;
        if (run.cost) dayData.totalCost += run.cost;
        if (run.duration) dayData.durations.push(run.duration);
      } else if (run.status === 'failed') {
        dayData.failedRuns++;
      }
    }

    return Array.from(dailyMetrics.values()).map((day) => ({
      date: day.date,
      totalRuns: day.totalRuns,
      successRate:
        day.totalRuns > 0
          ? Math.round((day.completedRuns / day.totalRuns) * 100)
          : 0,
      passRate:
        day.completedRuns > 0
          ? Math.round((day.passedRuns / day.completedRuns) * 100)
          : 0,
      totalCost: Math.round(day.totalCost * 100) / 100,
      avgDuration:
        day.durations.length > 0
          ? Math.round(
              day.durations.reduce((a: number, b: number) => a + b, 0) /
                day.durations.length,
            )
          : 0,
    }));
  }

  async getCostBreakdown(organizationId: string, days: number): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const costByEvalSpec = await db
      .select({
        evalSpecId: evalSpecs.id,
        evalSpecName: evalSpecs.name,
        totalCost: sql<number>`SUM(COALESCE(${runs.cost}, 0))`,
        avgCost: sql<number>`AVG(COALESCE(${runs.cost}, 0))`,
        runCount: count(),
      })
      .from(runs)
      .leftJoin(evalSpecs, eq(runs.evalSpecId, evalSpecs.id))
      .where(
        and(
          eq(runs.organizationId, organizationId),
          eq(runs.status, 'completed'),
          gte(runs.startedAt, startDate),
        ),
      )
      .groupBy(evalSpecs.id, evalSpecs.name)
      .orderBy(sql`SUM(COALESCE(${runs.cost}, 0)) DESC`);

    return {
      byEvalSpec: costByEvalSpec.map((row) => ({
        id: row.evalSpecId || 'unknown',
        name: row.evalSpecName || 'Unknown',
        totalCost: Math.round((row.totalCost || 0) * 100) / 100,
        avgCost: Math.round((row.avgCost || 0) * 100) / 100,
        runCount: row.runCount,
      })),
    };
  }

  async getRunsByDateRange(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    return await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, organizationId),
          gte(runs.createdAt, startDate),
          lte(runs.createdAt, endDate),
        ),
      )
      .orderBy(desc(runs.createdAt));
  }

  async getEvalSpec(id: string): Promise<any> {
    const [spec] = await db
      .select()
      .from(evalSpecs)
      .where(eq(evalSpecs.id, id));
    return spec;
  }

  async getModelUsageBreakdown(
    organizationId: string,
    days: number,
  ): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usageData = await db
      .select({
        modelId: modelUsage.modelId,
        modelName: models.displayName,
        totalCost: sum(modelUsage.totalCost),
        totalRequests: sum(modelUsage.requestCount),
        totalInputTokens: sum(modelUsage.inputTokens),
        totalOutputTokens: sum(modelUsage.outputTokens),
        avgLatency: avg(modelUsage.avgLatency),
      })
      .from(modelUsage)
      .innerJoin(models, eq(modelUsage.modelId, models.id))
      .where(
        and(
          eq(modelUsage.organizationId, organizationId),
          gte(modelUsage.date, startDate),
        ),
      )
      .groupBy(modelUsage.modelId, models.displayName)
      .orderBy(sql`SUM(${modelUsage.totalCost}) DESC`);

    return usageData.map((row) => ({
      modelId: row.modelId,
      modelName: row.modelName || 'Unknown',
      cost: Math.round((Number(row.totalCost) || 0) * 100) / 100,
      requests: Number(row.totalRequests) || 0,
      inputTokens: Number(row.totalInputTokens) || 0,
      outputTokens: Number(row.totalOutputTokens) || 0,
      avgLatency: row.avgLatency ? Math.round(Number(row.avgLatency)) : 0,
    }));
  }
}

