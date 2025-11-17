import { storage } from '../storage';
import type { Run, PolicyViolation, AlertConfig, AlertEvent } from '@shared/schema';

export interface AlertThreshold {
  metric: 'pass_rate' | 'avg_cost' | 'p95_latency' | 'error_rate';
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  timeWindowMinutes: number;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  thresholds: AlertThreshold[];
  cooldownMinutes: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[]; // webhook URLs, email addresses, etc.
}

export class AlertService {
  private activeAlerts = new Map<string, Date>(); // Track cooldown periods

  /**
   * Check for alert conditions after a run completes
   */
  async checkRunAlerts(runId: string): Promise<void> {
    try {
      const run = await storage.getRun(runId);
      if (!run) {
        console.error(`Run ${runId} not found for alert checking`);
        return;
      }

      // Check policy violations
      await this.checkPolicyViolationAlerts(run);

      // Check performance thresholds
      await this.checkPerformanceAlerts(run);

      // Check cost thresholds
      await this.checkCostAlerts(run);

    } catch (error) {
      console.error('Error checking run alerts:', error);
    }
  }

  /**
   * Check for policy violation alerts
   */
  private async checkPolicyViolationAlerts(run: Run): Promise<void> {
    const violations = await storage.getPolicyViolationsByRun(run.id);
    
    if (violations.length > 0) {
      // Get alert configs for policy violations
      const alertConfigs = await storage.getAlertConfigs(run.organizationId);
      const policyAlertConfigs = alertConfigs.filter(config => 
        config.type === 'policy_violation' && config.isActive
      );

      for (const config of policyAlertConfigs) {
        const conditions = config.conditions as any;
        
        // Check if violations match severity thresholds
        const criticalViolations = violations.filter(v => v.severity === 'critical');
        const highViolations = violations.filter(v => v.severity === 'high');
        
        let shouldAlert = false;
        let alertMessage = '';

        if (criticalViolations.length > 0 && conditions.criticalThreshold <= criticalViolations.length) {
          shouldAlert = true;
          alertMessage = `${criticalViolations.length} critical policy violations detected`;
        } else if (highViolations.length > 0 && conditions.highThreshold <= highViolations.length) {
          shouldAlert = true;
          alertMessage = `${highViolations.length} high severity policy violations detected`;
        } else if (violations.length > 0 && conditions.totalThreshold <= violations.length) {
          shouldAlert = true;
          alertMessage = `${violations.length} total policy violations detected`;
        }

        if (shouldAlert && !this.isInCooldown(config.id)) {
          await this.createAndSendAlert({
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
              violations: violations.map(v => ({
                policyId: v.policyId,
                severity: v.severity,
                message: v.message
              }))
            }
          });

          this.setCooldown(config.id, 15); // Default 15 minute cooldown
        }
      }
    }
  }

  /**
   * Check for performance threshold alerts
   */
  private async checkPerformanceAlerts(run: Run): Promise<void> {
    if (!run.duration) return;

    const alertConfigs = await storage.getAlertConfigs(run.organizationId);
    const performanceConfigs = alertConfigs.filter(config => 
      config.type === 'performance' && config.isActive
    );

    for (const config of performanceConfigs) {
      const conditions = config.conditions as any;
      
      let shouldAlert = false;
      let alertMessage = '';

      // Check duration threshold
      if (conditions.maxDurationSeconds && run.duration > conditions.maxDurationSeconds) {
        shouldAlert = true;
        alertMessage = `Run duration (${run.duration}s) exceeded threshold (${conditions.maxDurationSeconds}s)`;
      }

      // Check P95 latency against recent runs
      if (conditions.p95LatencyThreshold) {
        const recentRuns = await storage.getRunsByEvalSpec(run.evalSpecId);
        const completedRuns = recentRuns
          .filter(r => r.status === 'completed' && r.duration !== null)
          .slice(0, 20); // Last 20 runs

        if (completedRuns.length >= 5) {
          const durations = completedRuns.map(r => r.duration!).sort((a, b) => a - b);
          const p95Index = Math.floor(durations.length * 0.95);
          const p95Latency = durations[p95Index];

          if (p95Latency > conditions.p95LatencyThreshold) {
            shouldAlert = true;
            alertMessage = `P95 latency (${p95Latency}s) exceeded threshold (${conditions.p95LatencyThreshold}s)`;
          }
        }
      }

      if (shouldAlert && !this.isInCooldown(config.id)) {
        await this.createAndSendAlert({
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
            duration: run.duration
          }
        });

        this.setCooldown(config.id, config.cooldownMinutes);
      }
    }
  }

  /**
   * Check for cost threshold alerts
   */
  private async checkCostAlerts(run: Run): Promise<void> {
    if (!run.cost) return;

    const alertConfigs = await storage.getAlertConfigs(run.organizationId);
    const costConfigs = alertConfigs.filter(config => 
      config.alertType === 'cost' && config.isActive
    );

    for (const config of costConfigs) {
      const conditions = config.conditions as any;
      
      let shouldAlert = false;
      let alertMessage = '';

      // Check single run cost threshold
      if (conditions.maxCostPerRun && run.cost > conditions.maxCostPerRun) {
        shouldAlert = true;
        alertMessage = `Run cost ($${run.cost.toFixed(4)}) exceeded threshold ($${conditions.maxCostPerRun})`;
      }

      // Check daily cost threshold
      if (conditions.maxDailyCost) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayRuns = await storage.getRuns(run.organizationId, 1000);
        const todayCost = todayRuns
          .filter(r => r.completedAt && r.completedAt >= today && r.cost)
          .reduce((sum, r) => sum + r.cost!, 0);

        if (todayCost > conditions.maxDailyCost) {
          shouldAlert = true;
          alertMessage = `Daily cost ($${todayCost.toFixed(2)}) exceeded threshold ($${conditions.maxDailyCost})`;
        }
      }

      if (shouldAlert && !this.isInCooldown(config.id)) {
        await this.createAndSendAlert({
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
            cost: run.cost
          }
        });

        this.setCooldown(config.id, config.cooldownMinutes);
      }
    }
  }

  /**
   * Create and send an alert
   */
  private async createAndSendAlert(alertData: {
    configId: string;
    organizationId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    metadata?: any;
  }): Promise<AlertEvent> {
    // Create alert event
    const alertEvent = await storage.createAlertEvent({
      configId: alertData.configId,
      organizationId: alertData.organizationId,
      severity: alertData.severity,
      title: alertData.title,
      message: alertData.message,
      entityType: alertData.entityType,
      entityId: alertData.entityId,
      metadata: alertData.metadata,
      resolved: false,
    });

    // Get alert config for notification settings
    const config = await storage.getAlertConfigs(alertData.organizationId);
    const alertConfig = config.find(c => c.id === alertData.configId);

    if (alertConfig) {
      // Send notifications based on config
      await this.sendNotifications(alertEvent, alertConfig);
    }

    return alertEvent;
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alertEvent: AlertEvent, config: AlertConfig): Promise<void> {
    const notificationChannels = config.notificationChannels as any;

    // Send webhook notifications
    if (notificationChannels.webhooks?.length > 0) {
      for (const webhookUrl of notificationChannels.webhooks) {
        try {
          await this.sendWebhookNotification(webhookUrl, alertEvent);
        } catch (error) {
          console.error(`Failed to send webhook notification to ${webhookUrl}:`, error);
        }
      }
    }

    // Send email notifications (placeholder - would integrate with email service)
    if (notificationChannels.emails?.length > 0) {
      console.log(`Email notification would be sent to: ${notificationChannels.emails.join(', ')}`);
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    }

    // Send Slack notifications (placeholder - would integrate with Slack API)
    if (notificationChannels.slack?.webhookUrl) {
      try {
        await this.sendSlackNotification(notificationChannels.slack.webhookUrl, alertEvent);
      } catch (error) {
        console.error('Failed to send Slack notification:', error);
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(url: string, alertEvent: AlertEvent): Promise<void> {
    const payload = {
      id: alertEvent.id,
      severity: alertEvent.severity,
      title: alertEvent.title,
      message: alertEvent.message,
      entityType: alertEvent.entityType,
      entityId: alertEvent.entityId,
      createdAt: alertEvent.createdAt,
      metadata: alertEvent.metadata
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EvalOps-Alert-System/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(webhookUrl: string, alertEvent: AlertEvent): Promise<void> {
    const color = this.getSeverityColor(alertEvent.severity);
    const payload = {
      attachments: [{
        color,
        title: alertEvent.title,
        text: alertEvent.message,
        fields: [
          {
            title: 'Severity',
            value: alertEvent.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Entity',
            value: `${alertEvent.entityType}: ${alertEvent.entityId}`,
            short: true
          },
          {
            title: 'Time',
            value: alertEvent.createdAt?.toISOString() || 'Unknown',
            short: true
          }
        ],
        footer: 'EvalOps Alert System',
        ts: Math.floor((alertEvent.createdAt?.getTime() || Date.now()) / 1000)
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook request failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff6600';
      case 'medium': return '#ffcc00';
      case 'low': return '#00cc00';
      default: return '#808080';
    }
  }

  /**
   * Check if alert config is in cooldown period
   */
  private isInCooldown(configId: string): boolean {
    const lastAlert = this.activeAlerts.get(configId);
    if (!lastAlert) return false;

    const now = new Date();
    const cooldownEnd = new Date(lastAlert.getTime() + (15 * 60 * 1000)); // Default 15 minutes
    return now < cooldownEnd;
  }

  /**
   * Set cooldown period for alert config
   */
  private setCooldown(configId: string, cooldownMinutes: number = 15): void {
    this.activeAlerts.set(configId, new Date());
    
    // Clean up after cooldown period
    setTimeout(() => {
      this.activeAlerts.delete(configId);
    }, cooldownMinutes * 60 * 1000);
  }

  /**
   * Broadcast alert to real-time connections
   */
  broadcastAlert(organizationId: string, alertEvent: AlertEvent, app: any): void {
    if (app.broadcastToOrg) {
      app.broadcastToOrg(organizationId, {
        type: 'alert',
        data: alertEvent
      });
    }
  }
}

export const alertService = new AlertService();