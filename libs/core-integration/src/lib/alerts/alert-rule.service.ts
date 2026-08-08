import { Injectable, Logger } from '@nestjs/common';
import { CicdRepository, AlertsRepository } from '@evalops/shared-db';
import { type Run } from '@evalops/shared-db';

/** Shape of alert data passed back to the facade for notification dispatch. */
export type AlertData = {
  configId: string;
  organizationId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Evaluates alert rules against a completed run.
 * Returns collected alert data — notification dispatch is the facade's responsibility.
 */
@Injectable()
export class AlertRuleService {
  private readonly logger = new Logger(AlertRuleService.name);
  private activeAlerts = new Map<string, Date>(); // Track cooldown periods
  private readonly ALERT_COOLDOWN_MINUTES = 15;

  constructor(
    private cicdRepository: CicdRepository,
    private alertsRepository: AlertsRepository,
  ) {}

  /**
   * Check for alert conditions after a run completes.
   * Returns all alert data objects that should be dispatched.
   */
  async checkRunAlerts(runId: string): Promise<AlertData[]> {
    try {
      const run = await this.cicdRepository.findEvalRunById(runId);
      if (!run) {
        this.logger.error(`Run ${runId} not found for alert checking`);
        return [];
      }

      const results = await Promise.allSettled([
        this.checkPolicyViolationAlerts(run),
        this.checkPerformanceAlerts(run),
        this.checkCostAlerts(run),
      ]);
      const labels = ['policy', 'performance', 'cost'];
      const alerts: AlertData[] = [];
      for (const [i, r] of results.entries()) {
        if (r.status === 'fulfilled') alerts.push(...r.value);
        else this.logger.error(`${labels[i]} alert check failed for run ${run.id}:`, r.reason);
      }
      return alerts;
    } catch (error: unknown) {
      this.logger.error('Error checking run alerts:', error);
      return [];
    }
  }

  private async checkPolicyViolationAlerts(run: Run): Promise<AlertData[]> {
    const violations = await this.cicdRepository.findPolicyViolationsByRun(
      run.id,
    );

    const alerts: AlertData[] = [];

    if (violations.length > 0) {
      const alertConfigs = await this.alertsRepository.findConfigsByOrg(
        run.organizationId,
      );
      const policyAlertConfigs = alertConfigs.filter(
        (config) => config.type === 'policy_violation' && config.isActive,
      );

      for (const config of policyAlertConfigs) {
        const conditions = config.conditions as Record<string, unknown>;

        const criticalViolations = violations.filter(
          (v) => v.severity === 'critical',
        );
        const highViolations = violations.filter((v) => v.severity === 'high');

        let shouldAlert = false;
        let alertMessage = '';

        const criticalThreshold = conditions['criticalThreshold'] as number | undefined;
        const highThreshold = conditions['highThreshold'] as number | undefined;
        const totalThreshold = conditions['totalThreshold'] as number | undefined;

        if (
          criticalViolations.length > 0 &&
          criticalThreshold !== undefined &&
          criticalThreshold <= criticalViolations.length
        ) {
          shouldAlert = true;
          alertMessage = `${criticalViolations.length} critical policy violations detected`;
        } else if (
          highViolations.length > 0 &&
          highThreshold !== undefined &&
          highThreshold <= highViolations.length
        ) {
          shouldAlert = true;
          alertMessage = `${highViolations.length} high severity policy violations detected`;
        } else if (
          violations.length > 0 &&
          totalThreshold !== undefined &&
          totalThreshold <= violations.length
        ) {
          shouldAlert = true;
          alertMessage = `${violations.length} total policy violations detected`;
        }

        if (shouldAlert && !this.isInCooldown(config.id)) {
          alerts.push({
            configId: config.id,
            organizationId: run.organizationId,
            severity: 'high',
            title: 'Policy Violations Detected',
            message: alertMessage,
            entityType: 'run',
            entityId: run.id,
            metadata: {
              runId: run.id,
              evalSpecId: run.evalSpecId,
              violations: violations.map((v) => ({
                policyId: v.policyId,
                severity: v.severity,
                message: v.message,
              })),
            },
          });

          this.setCooldown(config.id, this.ALERT_COOLDOWN_MINUTES);
        }
      }
    }

    return alerts;
  }

  private async checkPerformanceAlerts(run: Run): Promise<AlertData[]> {
    if (!run.duration) return [];

    const alertConfigs = await this.alertsRepository.findConfigsByOrg(
      run.organizationId,
    );
    const performanceConfigs = alertConfigs.filter(
      (config) => config.type === 'performance' && config.isActive,
    );

    const alerts: AlertData[] = [];

    for (const config of performanceConfigs) {
      const conditions = config.conditions as Record<string, unknown>;
      const maxDurationSeconds = conditions['maxDurationSeconds'] as number | undefined;
      const p95LatencyThreshold = conditions['p95LatencyThreshold'] as number | undefined;

      let shouldAlert = false;
      let alertMessage = '';

      if (
        maxDurationSeconds !== undefined &&
        run.duration > maxDurationSeconds
      ) {
        shouldAlert = true;
        alertMessage = `Run duration (${run.duration}s) exceeded threshold (${maxDurationSeconds}s)`;
      }

      if (p95LatencyThreshold !== undefined) {
        const recentRuns = await this.cicdRepository.findEvalRunsByEvalSpec(
          run.evalSpecId,
        );
        const completedRuns = recentRuns
          .filter((r) => r.status === 'completed' && r.duration !== null)
          .slice(0, 20);

        if (completedRuns.length >= 5) {
          const durations = completedRuns
            .map((r) => r.duration!)
            .sort((a, b) => a - b);
          const p95Index = Math.floor(durations.length * 0.95);
          const p95Latency = durations[p95Index];

          if (p95Latency > p95LatencyThreshold) {
            shouldAlert = true;
            alertMessage = `P95 latency (${p95Latency}s) exceeded threshold (${p95LatencyThreshold}s)`;
          }
        }
      }

      if (shouldAlert && !this.isInCooldown(config.id)) {
        alerts.push({
          configId: config.id,
          organizationId: run.organizationId,
          severity: 'medium',
          title: 'Performance Threshold Exceeded',
          message: alertMessage,
          entityType: 'run',
          entityId: run.id,
          metadata: {
            runId: run.id,
            evalSpecId: run.evalSpecId,
            duration: run.duration,
          },
        });

        this.setCooldown(config.id, this.ALERT_COOLDOWN_MINUTES);
      }
    }

    return alerts;
  }

  private async checkCostAlerts(run: Run): Promise<AlertData[]> {
    if (!run.cost) return [];

    const alertConfigs = await this.alertsRepository.findConfigsByOrg(
      run.organizationId,
    );
    const costConfigs = alertConfigs.filter(
      (config) => config.type === 'cost' && config.isActive,
    );

    const alerts: AlertData[] = [];

    for (const config of costConfigs) {
      const conditions = config.conditions as Record<string, unknown>;
      const maxCostPerRun = conditions['maxCostPerRun'] as number | undefined;
      const maxDailyCost = conditions['maxDailyCost'] as number | undefined;

      let shouldAlert = false;
      let alertMessage = '';

      if (maxCostPerRun !== undefined && run.cost > maxCostPerRun) {
        shouldAlert = true;
        alertMessage = `Run cost ($${run.cost.toFixed(4)}) exceeded threshold ($${maxCostPerRun})`;
      }

      if (maxDailyCost !== undefined) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayRuns = await this.cicdRepository.findEvalRunsByOrg(
          run.organizationId,
          1000,
        );
        const todayCost = todayRuns
          .filter(
            (r) =>
              r.completedAt &&
              new Date(r.completedAt) >= today &&
              r.cost !== null,
          )
          .reduce((sum, r) => sum + (r.cost || 0), 0);

        if (todayCost > maxDailyCost) {
          shouldAlert = true;
          alertMessage = `Daily cost ($${todayCost.toFixed(2)}) exceeded threshold ($${maxDailyCost})`;
        }
      }

      if (shouldAlert && !this.isInCooldown(config.id)) {
        alerts.push({
          configId: config.id,
          organizationId: run.organizationId,
          severity: 'high',
          title: 'Cost Threshold Exceeded',
          message: alertMessage,
          entityType: 'run',
          entityId: run.id,
          metadata: {
            runId: run.id,
            evalSpecId: run.evalSpecId,
            cost: run.cost,
          },
        });

        this.setCooldown(config.id, this.ALERT_COOLDOWN_MINUTES);
      }
    }

    return alerts;
  }

  private isInCooldown(configId: string): boolean {
    const lastAlert = this.activeAlerts.get(configId);
    if (!lastAlert) return false;

    const now = new Date();
    const cooldownEnd = new Date(lastAlert.getTime() + this.ALERT_COOLDOWN_MINUTES * 60 * 1000);
    return now < cooldownEnd;
  }

  private setCooldown(configId: string, cooldownMinutes = this.ALERT_COOLDOWN_MINUTES): void {
    this.activeAlerts.set(configId, new Date());

    setTimeout(() => {
      this.activeAlerts.delete(configId);
    }, cooldownMinutes * 60 * 1000);
  }
}
