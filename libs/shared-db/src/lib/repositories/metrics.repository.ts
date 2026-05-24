import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { runs, evalSpecs, modelUsage, models } from '../schema';
import { eq, and, gte, lte, desc, sql, count, avg, sum } from 'drizzle-orm';

export interface TrendMetric {
  date: string;
  totalRuns: number;
  successRate: number;
  passRate: number;
  totalCost: number;
  avgDuration: number;
}

export interface CostBreakdown {
  byEvalSpec: {
    id: string;
    name: string;
    totalCost: number;
    avgCost: number;
    runCount: number;
  }[];
}

export interface ModelUsageMetric {
  modelId: string;
  modelName: string;
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  avgLatency: number;
}

@Injectable()
export class MetricsRepository {
  async getTrends(
    organizationId: string,
    days: number,
  ): Promise<TrendMetric[]> {
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

    const dailyMetrics = new Map<
      string,
      {
        date: string;
        totalRuns: number;
        completedRuns: number;
        passedRuns: number;
        failedRuns: number;
        totalCost: number;
        durations: number[];
      }
    >();

    for (const run of runsData) {
      const date = run.date;
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

      const dayData = dailyMetrics.get(date)!;
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
              day.durations.reduce((a, b) => a + b, 0) / day.durations.length,
            )
          : 0,
    }));
  }

  async getCostBreakdown(
    organizationId: string,
    days: number,
  ): Promise<CostBreakdown> {
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
  ): Promise<(typeof runs.$inferSelect)[]> {
    return db
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

  async findEvalSpec(id: string): Promise<typeof evalSpecs.$inferSelect | undefined> {
    const [spec] = await db
      .select()
      .from(evalSpecs)
      .where(eq(evalSpecs.id, id));
    return spec;
  }

  async getModelUsageBreakdown(
    organizationId: string,
    days: number,
  ): Promise<ModelUsageMetric[]> {
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
