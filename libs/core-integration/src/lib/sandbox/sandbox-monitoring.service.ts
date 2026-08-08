import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SandboxAuditService } from './sandbox-audit.service';
import { ResourceUsage } from './sandbox-security.service';

export interface SandboxMetrics {
  creationCount: number;
  executionCount: number;
  averageExecutionTime: number; // milliseconds
  averageCpuUsage: number;
  averageMemoryUsage: number; // bytes
  securityViolationCount: number;
  failureRate: number; // 0-1
  resourceLimitViolations: number;
}

export interface AnomalyDetectionResult {
  hasAnomalies: boolean;
  anomalies: Anomaly[];
}

export interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  sandboxId?: string;
  timestamp: Date;
}

/**
 * Sandbox Monitoring Service
 *
 * Tracks sandbox metrics, detects anomalies, and provides observability.
 * Monitors:
 * - Sandbox creation rate
 * - Code execution duration
 * - Resource usage (CPU, memory)
 * - Security violations
 * - Failure rates
 * - Resource limit violations
 */
@Injectable()
export class SandboxMonitoringService {
  private readonly logger = new Logger(SandboxMonitoringService.name);
  private readonly enableMonitoring: boolean;
  private readonly enableAnomalyDetection: boolean;
  private readonly resourceAlertThreshold: number;

  // In-memory metrics cache (can be moved to Redis for distributed systems)
  private readonly metricsCache = new Map<
    string,
    {
      creationCount: number;
      executionCount: number;
      totalExecutionTime: number;
      totalCpuUsage: number;
      totalMemoryUsage: number;
      securityViolationCount: number;
      failureCount: number;
      resourceLimitViolations: number;
      lastUpdated: number;
    }
  >();

  // Code hash tracking for anomaly detection
  private readonly codeHashFrequency = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: SandboxAuditService,
  ) {
    this.enableMonitoring =
      this.configService.get<boolean>('OPENSANDBOX_ENABLE_MONITORING') ?? true;
    this.enableAnomalyDetection =
      this.configService.get<boolean>('OPENSANDBOX_ANOMALY_DETECTION') ?? true;
    this.resourceAlertThreshold =
      this.configService.get<number>('OPENSANDBOX_RESOURCE_ALERT_THRESHOLD') ??
      0.8;
  }

  /**
   * Record sandbox creation
   */
  recordCreation(organizationId: string): void {
    if (!this.enableMonitoring) {
      return;
    }

    const metrics = this.getOrCreateMetrics(organizationId);
    metrics.creationCount++;
    metrics.lastUpdated = Date.now();
  }

  /**
   * Record code execution
   */
  recordExecution(
    organizationId: string,
    resourceUsage?: ResourceUsage,
    success = true,
  ): void {
    if (!this.enableMonitoring) {
      return;
    }

    const metrics = this.getOrCreateMetrics(organizationId);
    metrics.executionCount++;

    if (resourceUsage) {
      metrics.totalExecutionTime += resourceUsage.executionTime || 0;
      metrics.totalCpuUsage += resourceUsage.cpu || 0;
      metrics.totalMemoryUsage += resourceUsage.memory || 0;
    }

    if (!success) {
      metrics.failureCount++;
    }

    metrics.lastUpdated = Date.now();
  }

  /**
   * Record security violation
   */
  recordSecurityViolation(organizationId: string): void {
    if (!this.enableMonitoring) {
      return;
    }

    const metrics = this.getOrCreateMetrics(organizationId);
    metrics.securityViolationCount++;
    metrics.lastUpdated = Date.now();
  }

  /**
   * Record resource limit violation
   */
  recordResourceLimitViolation(organizationId: string): void {
    if (!this.enableMonitoring) {
      return;
    }

    const metrics = this.getOrCreateMetrics(organizationId);
    metrics.resourceLimitViolations++;
    metrics.lastUpdated = Date.now();
  }

  /**
   * Track code hash for anomaly detection
   */
  trackCodeHash(codeHash: string): void {
    if (!this.enableAnomalyDetection) {
      return;
    }

    const current = this.codeHashFrequency.get(codeHash) || 0;
    this.codeHashFrequency.set(codeHash, current + 1);
  }

  /**
   * Get metrics for an organization
   */
  getMetrics(organizationId: string): SandboxMetrics {
    const cached = this.metricsCache.get(organizationId);
    if (!cached || cached.executionCount === 0) {
      return {
        creationCount: cached?.creationCount || 0,
        executionCount: 0,
        averageExecutionTime: 0,
        averageCpuUsage: 0,
        averageMemoryUsage: 0,
        securityViolationCount: cached?.securityViolationCount || 0,
        failureRate: 0,
        resourceLimitViolations: cached?.resourceLimitViolations || 0,
      };
    }

    return {
      creationCount: cached.creationCount,
      executionCount: cached.executionCount,
      averageExecutionTime:
        cached.totalExecutionTime / cached.executionCount,
      averageCpuUsage: cached.totalCpuUsage / cached.executionCount,
      averageMemoryUsage: cached.totalMemoryUsage / cached.executionCount,
      securityViolationCount: cached.securityViolationCount,
      failureRate: cached.failureCount / cached.executionCount,
      resourceLimitViolations: cached.resourceLimitViolations,
    };
  }

  /**
   * Detect anomalies for an organization
   */
  async detectAnomalies(
    organizationId: string,
    sandboxId?: string,
  ): Promise<AnomalyDetectionResult> {
    if (!this.enableAnomalyDetection) {
      return { hasAnomalies: false, anomalies: [] };
    }

    const anomalies: Anomaly[] = [];
    const metrics = this.getMetrics(organizationId);

    // Check for excessive resource usage
    if (metrics.averageCpuUsage > this.resourceAlertThreshold) {
      anomalies.push({
        type: 'excessive_cpu_usage',
        severity: 'high',
        message: `Average CPU usage (${metrics.averageCpuUsage.toFixed(2)}) exceeds threshold (${this.resourceAlertThreshold})`,
        sandboxId,
        timestamp: new Date(),
      });
    }

    // Check for high failure rate
    if (metrics.failureRate > 0.5) {
      anomalies.push({
        type: 'high_failure_rate',
        severity: 'high',
        message: `Failure rate (${(metrics.failureRate * 100).toFixed(1)}%) exceeds 50%`,
        sandboxId,
        timestamp: new Date(),
      });
    }

    // Check for repeated security violations
    if (metrics.securityViolationCount > 10) {
      anomalies.push({
        type: 'repeated_security_violations',
        severity: 'medium',
        message: `Security violations count (${metrics.securityViolationCount}) is unusually high`,
        sandboxId,
        timestamp: new Date(),
      });
    }

    // Check for suspicious code patterns (same code hash executed many times)
    if (sandboxId) {
      const auditLogs = await this.auditService.getSandboxAuditLogs(
        sandboxId,
        100,
      );
      const codeHashes = new Map<string, number>();
      for (const log of auditLogs) {
        if (log.codeHash) {
          const count = codeHashes.get(log.codeHash) || 0;
          codeHashes.set(log.codeHash, count + 1);
        }
      }

      for (const [hash, count] of codeHashes.entries()) {
        if (count > 20) {
          anomalies.push({
            type: 'repeated_code_execution',
            severity: 'low',
            message: `Same code hash executed ${count} times (possible automated attack)`,
            sandboxId,
            timestamp: new Date(),
          });
        }
      }
    }

    // Check for unusual execution times
    if (
      metrics.averageExecutionTime > 30000 &&
      metrics.executionCount > 5
    ) {
      anomalies.push({
        type: 'unusual_execution_time',
        severity: 'medium',
        message: `Average execution time (${metrics.averageExecutionTime.toFixed(0)}ms) is unusually high`,
        sandboxId,
        timestamp: new Date(),
      });
    }

    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
    };
  }

  /**
   * Get Prometheus-compatible metrics (for observability)
   */
  getPrometheusMetrics(organizationId: string): string {
    const metrics = this.getMetrics(organizationId);
    const labels = `organization_id="${organizationId}"`;

    return `
# Sandbox metrics for organization ${organizationId}
evalops_sandbox_creation_count{${labels}} ${metrics.creationCount}
evalops_sandbox_execution_count{${labels}} ${metrics.executionCount}
evalops_sandbox_avg_execution_time_ms{${labels}} ${metrics.averageExecutionTime.toFixed(2)}
evalops_sandbox_avg_cpu_usage{${labels}} ${metrics.averageCpuUsage.toFixed(2)}
evalops_sandbox_avg_memory_usage_bytes{${labels}} ${metrics.averageMemoryUsage.toFixed(0)}
evalops_sandbox_security_violations{${labels}} ${metrics.securityViolationCount}
evalops_sandbox_failure_rate{${labels}} ${metrics.failureRate.toFixed(4)}
evalops_sandbox_resource_limit_violations{${labels}} ${metrics.resourceLimitViolations}
`.trim();
  }

  /**
   * Reset metrics for an organization (for testing or cleanup)
   */
  resetMetrics(organizationId: string): void {
    this.metricsCache.delete(organizationId);
  }

  /**
   * Get or create metrics for an organization
   */
  private getOrCreateMetrics(organizationId: string) {
    let metrics = this.metricsCache.get(organizationId);
    if (!metrics) {
      metrics = {
        creationCount: 0,
        executionCount: 0,
        totalExecutionTime: 0,
        totalCpuUsage: 0,
        totalMemoryUsage: 0,
        securityViolationCount: 0,
        failureCount: 0,
        resourceLimitViolations: 0,
        lastUpdated: Date.now(),
      };
      this.metricsCache.set(organizationId, metrics);
    }
    return metrics;
  }
}
