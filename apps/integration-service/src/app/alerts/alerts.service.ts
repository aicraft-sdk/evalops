import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseStorageService } from '../storage/database-storage.service';
import {
  type Run,
  type PolicyViolation,
  type AlertConfig,
  type AlertEvent,
  type InsertAlertEvent,
} from '@evalops/shared-db';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private activeAlerts = new Map<string, Date>(); // Track cooldown periods
  private readonly ALERT_COOLDOWN_MINUTES = 15;

  constructor(
    private storageService: DatabaseStorageService,
    private httpService: HttpService,
  ) {}

  /**
   * Check for alert conditions after a run completes
   */
  async checkRunAlerts(runId: string): Promise<void> {
    try {
      const run = await this.storageService.getRun(runId);
      if (!run) {
        this.logger.error(`Run ${runId} not found for alert checking`);
        return;
      }

      // Check policy violations
      await this.checkPolicyViolationAlerts(run);

      // Check performance thresholds
      await this.checkPerformanceAlerts(run);

      // Check cost thresholds
      await this.checkCostAlerts(run);
    } catch (error: unknown) {
      this.logger.error('Error checking run alerts:', error);
    }
  }

  /**
   * Check for policy violation alerts
   */
  private async checkPolicyViolationAlerts(run: Run): Promise<void> {
    const violations = await this.storageService.getPolicyViolationsByRun(
      run.id,
    );

    if (violations.length > 0) {
      // Get alert configs for policy violations
      const alertConfigs = await this.storageService.getAlertConfigs(
        run.organizationId,
      );
      const policyAlertConfigs = alertConfigs.filter(
        (config) => config.type === 'policy_violation' && config.isActive,
      );

      for (const config of policyAlertConfigs) {
        const conditions = config.conditions as Record<string, unknown>;

        // Check if violations match severity thresholds
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
  }

  /**
   * Check for performance threshold alerts
   */
  private async checkPerformanceAlerts(run: Run): Promise<void> {
    if (!run.duration) return;

    const alertConfigs = await this.storageService.getAlertConfigs(
      run.organizationId,
    );
    const performanceConfigs = alertConfigs.filter(
      (config) => config.type === 'performance' && config.isActive,
    );

    for (const config of performanceConfigs) {
      const conditions = config.conditions as Record<string, unknown>;
      const maxDurationSeconds = conditions['maxDurationSeconds'] as number | undefined;
      const p95LatencyThreshold = conditions['p95LatencyThreshold'] as number | undefined;

      let shouldAlert = false;
      let alertMessage = '';

      // Check duration threshold
      if (
        maxDurationSeconds !== undefined &&
        run.duration > maxDurationSeconds
      ) {
        shouldAlert = true;
        alertMessage = `Run duration (${run.duration}s) exceeded threshold (${maxDurationSeconds}s)`;
      }

      // Check P95 latency against recent runs
      if (p95LatencyThreshold !== undefined) {
        const recentRuns = await this.storageService.getRunsByEvalSpec(
          run.evalSpecId,
        );
        const completedRuns = recentRuns
          .filter((r) => r.status === 'completed' && r.duration !== null)
          .slice(0, 20); // Last 20 runs

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
            duration: run.duration,
          },
        });

        this.setCooldown(config.id, this.ALERT_COOLDOWN_MINUTES);
      }
    }
  }

  /**
   * Check for cost threshold alerts
   */
  private async checkCostAlerts(run: Run): Promise<void> {
    if (!run.cost) return;

    const alertConfigs = await this.storageService.getAlertConfigs(
      run.organizationId,
    );
    const costConfigs = alertConfigs.filter(
      (config) => config.type === 'cost' && config.isActive,
    );

    for (const config of costConfigs) {
      const conditions = config.conditions as Record<string, unknown>;
      const maxCostPerRun = conditions['maxCostPerRun'] as number | undefined;
      const maxDailyCost = conditions['maxDailyCost'] as number | undefined;

      let shouldAlert = false;
      let alertMessage = '';

      // Check single run cost threshold
      if (maxCostPerRun !== undefined && run.cost > maxCostPerRun) {
        shouldAlert = true;
        alertMessage = `Run cost ($${run.cost.toFixed(4)}) exceeded threshold ($${maxCostPerRun})`;
      }

      // Check daily cost threshold
      if (maxDailyCost !== undefined) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayRuns = await this.storageService.getRuns(
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
            cost: run.cost,
          },
        });

        this.setCooldown(config.id, this.ALERT_COOLDOWN_MINUTES);
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
    metadata?: Record<string, unknown>;
  }): Promise<AlertEvent> {
    // Create alert event
    const alertEvent = await this.storageService.createAlertEvent({
      configId: alertData.configId,
      organizationId: alertData.organizationId,
      severity: alertData.severity,
      title: alertData.title,
      message: alertData.message,
      metadata: {
        ...alertData.metadata,
        entityType: alertData.entityType,
        entityId: alertData.entityId,
      },
      notificationsSent: [],
      resolved: false,
    } as InsertAlertEvent);

    // Get alert config for notification settings
    const alertConfigs = await this.storageService.getAlertConfigs(
      alertData.organizationId,
    );
    const alertConfig = alertConfigs.find((c) => c.id === alertData.configId);

    if (alertConfig) {
      // Send notifications based on config
      await this.sendNotifications(alertEvent, alertConfig);
    }

    return alertEvent;
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(
    alertEvent: AlertEvent,
    config: AlertConfig,
  ): Promise<void> {
    const channels = config.channels as Record<string, unknown>;

    // Send webhook notifications
    const webhooks = channels['webhooks'];
    if (Array.isArray(webhooks) && webhooks.length > 0) {
      for (const webhookUrl of webhooks) {
        try {
          await this.sendWebhookNotification(webhookUrl as string, alertEvent);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to send webhook notification to ${webhookUrl}:`,
            error,
          );
        }
      }
    }

    // Send email notifications
    const emails = channels['emails'];
    if (Array.isArray(emails) && emails.length > 0) {
      for (const email of emails) {
        try {
          await this.sendEmailAlert(config, alertEvent, email as string);
        } catch (error: unknown) {
          this.logger.error(`Failed to send email to ${email}:`, error);
        }
      }
    }

    // Send Slack notifications
    const slack = channels['slack'] as Record<string, unknown> | undefined;
    if (slack?.['webhookUrl']) {
      try {
        await this.sendSlackNotification(
          slack['webhookUrl'] as string,
          alertEvent,
        );
      } catch (error: unknown) {
        this.logger.error('Failed to send Slack notification:', error);
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    url: string,
    alertEvent: AlertEvent,
  ): Promise<void> {
    const payload = {
      id: alertEvent.id,
      severity: alertEvent.severity,
      title: alertEvent.title,
      message: alertEvent.message,
      metadata: alertEvent.metadata,
      createdAt: alertEvent.createdAt,
    };

    await firstValueFrom(
      this.httpService.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'EvalOps-Alert-System/1.0',
        },
      }),
    );
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    webhookUrl: string,
    alertEvent: AlertEvent,
  ): Promise<void> {
    const color = this.getSeverityColor(alertEvent.severity);
    const payload = {
      attachments: [
        {
          color,
          title: alertEvent.title,
          text: alertEvent.message,
          fields: [
            {
              title: 'Severity',
              value: alertEvent.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Time',
              value:
                alertEvent.createdAt?.toISOString() || new Date().toISOString(),
              short: true,
            },
          ],
          footer: 'EvalOps Alert System',
          ts: Math.floor(
            (alertEvent.createdAt?.getTime() || Date.now()) / 1000,
          ),
        },
      ],
    };

    await firstValueFrom(
      this.httpService.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  }

  /**
   * Send email alert using configured email service
   */
  private async sendEmailAlert(
    config: AlertConfig,
    alertEvent: AlertEvent,
    email: string,
  ): Promise<void> {
    try {
      // Check if email service is configured
      const emailServiceUrl = process.env.EMAIL_SERVICE_URL;
      const emailApiKey = process.env.EMAIL_API_KEY;

      if (!emailServiceUrl && !emailApiKey) {
        // Fallback: Use SendGrid API directly if API key is provided
        const sendGridApiKey = process.env.SENDGRID_API_KEY;
        if (sendGridApiKey) {
          await this.sendEmailViaSendGrid(sendGridApiKey, email, alertEvent);
          return;
        }

        // Fallback: Use AWS SES if configured
        const awsSesRegion = process.env.AWS_SES_REGION;
        const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        if (awsSesRegion && awsAccessKeyId && awsSecretAccessKey) {
          await this.sendEmailViaSES(
            awsSesRegion,
            awsAccessKeyId,
            awsSecretAccessKey,
            email,
            alertEvent,
          );
          return;
        }

        this.logger.warn(
          `No email service configured. Email notification skipped for ${email}`,
        );
        return;
      }

      // Use custom email service
      if (emailServiceUrl) {
        await firstValueFrom(
          this.httpService.post(
            emailServiceUrl,
            {
              to: email,
              subject: `[EvalOps Alert] ${alertEvent.title}`,
              body: this.formatEmailBody(alertEvent),
              html: this.formatEmailHtml(alertEvent),
            },
            {
              headers: {
                'Content-Type': 'application/json',
                ...(emailApiKey && { Authorization: `Bearer ${emailApiKey}` }),
              },
            },
          ),
        );
        this.logger.log(`Email sent to ${email} via custom service`);
      }
    } catch (error: unknown) {
      this.logger.error(`Failed to send email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send email via SendGrid API
   */
  private async sendEmailViaSendGrid(
    apiKey: string,
    email: string,
    alertEvent: AlertEvent,
  ): Promise<void> {
    const fromEmail = process.env.EMAIL_FROM || 'alerts@evalops.com';
    const payload = {
      personalizations: [
        {
          to: [{ email }],
          subject: `[EvalOps Alert] ${alertEvent.title}`,
        },
      ],
      from: { email: fromEmail },
      content: [
        {
          type: 'text/plain',
          value: this.formatEmailBody(alertEvent),
        },
        {
          type: 'text/html',
          value: this.formatEmailHtml(alertEvent),
        },
      ],
    };

    await firstValueFrom(
      this.httpService.post('https://api.sendgrid.com/v3/mail/send', payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }),
    );
    this.logger.log(`Email sent to ${email} via SendGrid`);
  }

  /**
   * Send email via AWS SES (simplified - would need AWS SDK for full implementation)
   */
  private async sendEmailViaSES(
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    email: string,
    alertEvent: AlertEvent,
  ): Promise<void> {
    // Note: Full AWS SES implementation would require @aws-sdk/client-ses
    // This is a placeholder that shows the structure
    this.logger.warn(
      'AWS SES email sending requires AWS SDK. Please install @aws-sdk/client-ses for full support.',
    );
    // For now, log that email would be sent
    this.logger.log(
      `Email would be sent to ${email} via AWS SES (${region}) for alert ${alertEvent.id}`,
    );
  }

  /**
   * Format email body as plain text
   */
  private formatEmailBody(alertEvent: AlertEvent): string {
    return `
EvalOps Alert Notification

Severity: ${alertEvent.severity.toUpperCase()}
Title: ${alertEvent.title}
Message: ${alertEvent.message}

Time: ${alertEvent.createdAt?.toISOString() || new Date().toISOString()}

View details in EvalOps dashboard.
    `.trim();
  }

  /**
   * Format email body as HTML
   */
  private formatEmailHtml(alertEvent: AlertEvent): string {
    const color = this.getSeverityColor(alertEvent.severity);
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .alert-box { border-left: 4px solid ${color}; padding: 15px; background: #f5f5f5; margin: 20px 0; }
    .severity { font-weight: bold; color: ${color}; }
  </style>
</head>
<body>
  <h2>EvalOps Alert Notification</h2>
  <div class="alert-box">
    <p><span class="severity">Severity:</span> ${alertEvent.severity.toUpperCase()}</p>
    <p><strong>${alertEvent.title}</strong></p>
    <p>${alertEvent.message}</p>
    <p><small>Time: ${alertEvent.createdAt?.toISOString() || new Date().toISOString()}</small></p>
  </div>
  <p>View details in your EvalOps dashboard.</p>
</body>
</html>
    `.trim();
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#ff0000';
      case 'high':
        return '#ff6600';
      case 'medium':
        return '#ffcc00';
      case 'low':
        return '#00cc00';
      default:
        return '#808080';
    }
  }

  /**
   * Check if alert config is in cooldown period
   */
  private isInCooldown(configId: string): boolean {
    const lastAlert = this.activeAlerts.get(configId);
    if (!lastAlert) return false;

    const now = new Date();
    const cooldownEnd = new Date(lastAlert.getTime() + this.ALERT_COOLDOWN_MINUTES * 60 * 1000);
    return now < cooldownEnd;
  }

  /**
   * Set cooldown period for alert config
   */
  private setCooldown(configId: string, cooldownMinutes = this.ALERT_COOLDOWN_MINUTES): void {
    this.activeAlerts.set(configId, new Date());

    // Clean up after cooldown period
    setTimeout(() => {
      this.activeAlerts.delete(configId);
    }, cooldownMinutes * 60 * 1000);
  }

  /**
   * Create alert (public method for controller)
   */
  async createAlert(config: Parameters<typeof this.createAndSendAlert>[0]): Promise<AlertEvent> {
    // This is a simplified version - full implementation would validate and create alert config
    return this.createAndSendAlert(config);
  }
}
