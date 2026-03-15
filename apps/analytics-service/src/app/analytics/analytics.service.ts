import { Injectable, Logger } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';

export interface TrendData {
  date: string;
  runs: number;
  totalCost: number;
  avgLatency: number;
  avgQuality: number;
  passRate: number;
}

export interface CostBreakdown {
  byModel: Array<{
    modelId: string;
    modelName: string;
    cost: number;
    requests: number;
    avgLatency: number;
  }>;
  byEvalSpec: Array<{
    evalSpecId: string;
    evalSpecName: string;
    cost: number;
    runs: number;
  }>;
  total: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface PerformanceComparison {
  current: {
    avgLatency: number;
    avgCost: number;
    avgQuality: number;
    totalRuns: number;
  };
  previous: {
    avgLatency: number;
    avgCost: number;
    avgQuality: number;
    totalRuns: number;
  };
  changes: {
    latency: number; // percentage change
    cost: number; // percentage change
    quality: number; // percentage change
  };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private storageService: DatabaseStorageService) {}

  async getTrends(
    organizationId: string,
    days = 30,
  ): Promise<TrendData[]> {
    // Use the existing getTrends method from storage service
    const trends = await this.storageService.getTrends(organizationId, days);
    
    // Transform to match TrendData interface
    return trends.map((trend) => ({
      date: trend.date,
      runs: trend.totalRuns,
      totalCost: trend.totalCost,
      avgLatency: trend.avgDuration || 0,
      avgQuality: 0, // Not available in current implementation
      passRate: trend.passRate || 0,
    }));
  }

  async getCostBreakdown(
    organizationId: string,
    days = 30,
  ): Promise<CostBreakdown> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Use existing storage method
    const breakdown = await this.storageService.getCostBreakdown(
      organizationId,
      days,
    );

    // Transform to match CostBreakdown interface
    const byEvalSpec = breakdown.byEvalSpec.map((spec) => ({
      evalSpecId: spec.id || spec.name,
      evalSpecName: spec.name,
      cost: spec.totalCost,
      runs: spec.runCount,
    }));

    // Get model breakdown
    const modelBreakdown = await this.storageService.getModelUsageBreakdown(
      organizationId,
      days,
    );

    const byModel = modelBreakdown.map((model) => ({
      modelId: model.modelId,
      modelName: model.modelName,
      cost: model.cost,
      requests: model.requests,
      avgLatency: model.avgLatency,
    }));

    // Calculate total cost
    const total = byEvalSpec.reduce((sum, spec) => sum + spec.cost, 0);

    return {
      byModel,
      byEvalSpec,
      total,
      period: {
        start: startDate,
        end: endDate,
      },
    };
  }

  async getPerformanceComparison(
    organizationId: string,
    days = 30,
  ): Promise<PerformanceComparison> {
    const endDate = new Date();
    const midDate = new Date();
    midDate.setDate(midDate.getDate() - days);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days * 2);

    // Get current period runs
    const currentRuns = await this.storageService.getRunsByDateRange(
      organizationId,
      midDate,
      endDate,
    );

    // Get previous period runs
    const previousRuns = await this.storageService.getRunsByDateRange(
      organizationId,
      startDate,
      midDate,
    );

    const current = this.calculatePeriodMetrics(currentRuns);
    const previous = this.calculatePeriodMetrics(previousRuns);

    const changes = {
      latency:
        previous.avgLatency > 0
          ? ((current.avgLatency - previous.avgLatency) / previous.avgLatency) *
            100
          : 0,
      cost:
        previous.avgCost > 0
          ? ((current.avgCost - previous.avgCost) / previous.avgCost) * 100
          : 0,
      quality:
        previous.avgQuality > 0
          ? ((current.avgQuality - previous.avgQuality) /
             previous.avgQuality) *
            100
          : 0,
    };

    return {
      current,
      previous,
      changes,
    };
  }

  private calculatePeriodMetrics(runs: any[]): {
    avgLatency: number;
    avgCost: number;
    avgQuality: number;
    totalRuns: number;
  } {
    if (runs.length === 0) {
      return {
        avgLatency: 0,
        avgCost: 0,
        avgQuality: 0,
        totalRuns: 0,
      };
    }

    let totalLatency = 0;
    let totalCost = 0;
    let totalQuality = 0;
    let qualityCount = 0;

    for (const run of runs) {
      totalCost += run.cost || 0;

      if (run.metrics && typeof run.metrics === 'object') {
        const metrics = run.metrics as any;
        const latencyP50 = metrics.latencyP50?.mean || 0;
        const latencyP95 = metrics.latencyP95?.mean || 0;
        totalLatency += (latencyP50 + latencyP95) / 2;

        const qualityScores: number[] = [];
        if (metrics.exactMatch?.mean) qualityScores.push(metrics.exactMatch.mean);
        if (metrics.llmAsJudgeWinRate?.mean)
          qualityScores.push(metrics.llmAsJudgeWinRate.mean);
        if (qualityScores.length > 0) {
          totalQuality +=
            qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
          qualityCount++;
        }
      }
    }

    return {
      avgLatency: totalLatency / runs.length,
      avgCost: totalCost / runs.length,
      avgQuality: qualityCount > 0 ? totalQuality / qualityCount : 0,
      totalRuns: runs.length,
    };
  }
}
