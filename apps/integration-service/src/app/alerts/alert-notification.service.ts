import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseStorageService } from '../storage/database-storage.service';
import {
  type AlertConfig,
  type AlertEvent,
  type InsertAlertEvent,
} from '@evalops/shared-db';

/**
 * Handles alert event creation and notification dispatch (webhook, Slack, email).
 * Rule-evaluation logic lives in AlertRuleService.
 */
@Injectable()
export class AlertNotificationService {
  private readonly logger = new Logger(AlertNotificationService.name);

  constructor(
    private storageService: DatabaseStorageService,
    private httpService: HttpService,
  ) {}

  /**
   * Persist an alert event and dispatch all configured notifications.
   */
  async createAndSendAlert(alertData: {
    configId: string;
    organizationId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<AlertEvent> {
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

    const alertConfigs = await this.storageService.getAlertConfigs(
      alertData.organizationId,
    );
    const alertConfig = alertConfigs.find((c) => c.id === alertData.configId);

    if (alertConfig) {
      await this.sendNotifications(alertEvent, alertConfig);
    }

    return alertEvent;
  }

  private async sendNotifications(
    alertEvent: AlertEvent,
    config: AlertConfig,
  ): Promise<void> {
    const channels = config.channels as Record<string, unknown>;

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

  private async sendEmailAlert(
    config: AlertConfig,
    alertEvent: AlertEvent,
    email: string,
  ): Promise<void> {
    try {
      const emailServiceUrl = process.env.EMAIL_SERVICE_URL;
      const emailApiKey = process.env.EMAIL_API_KEY;

      if (!emailServiceUrl && !emailApiKey) {
        const sendGridApiKey = process.env.SENDGRID_API_KEY;
        if (sendGridApiKey) {
          await this.sendEmailViaSendGrid(sendGridApiKey, email, alertEvent);
          return;
        }

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

  private async sendEmailViaSES(
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    email: string,
    alertEvent: AlertEvent,
  ): Promise<void> {
    // Note: Full AWS SES implementation would require @aws-sdk/client-ses
    this.logger.warn(
      'AWS SES email sending requires AWS SDK. Please install @aws-sdk/client-ses for full support.',
    );
    this.logger.log(
      `Email would be sent to ${email} via AWS SES (${region}) for alert ${alertEvent.id}`,
    );
  }

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
}
