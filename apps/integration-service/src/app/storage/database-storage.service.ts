import { Injectable } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  cicdIntegrations,
  cicdRuns,
  webhookEvents,
  alertConfigs,
  alertEvents,
  runs,
  policyViolations,
  type CicdIntegration,
  type InsertCicdIntegration,
  type CicdRun,
  type InsertCicdRun,
  type WebhookEvent,
  type InsertWebhookEvent,
  type AlertConfig,
  type InsertAlertConfig,
  type AlertEvent,
  type InsertAlertEvent,
  type Run,
  type PolicyViolation,
} from '@evalops/shared-db';
import { eq, desc, and, gte } from 'drizzle-orm';

// Use Drizzle's inferred types as fallback
type CicdIntegrationInsert = typeof cicdIntegrations.$inferInsert;
type CicdRunInsert = typeof cicdRuns.$inferInsert;
type WebhookEventInsert = typeof webhookEvents.$inferInsert;
type AlertConfigInsert = typeof alertConfigs.$inferInsert;
type AlertEventInsert = typeof alertEvents.$inferInsert;

@Injectable()
export class DatabaseStorageService {
  // CI/CD Integration operations
  async getCicdIntegrations(
    organizationId: string
  ): Promise<CicdIntegration[]> {
    return await db
      .select()
      .from(cicdIntegrations)
      .where(eq(cicdIntegrations.organizationId, organizationId))
      .orderBy(desc(cicdIntegrations.createdAt));
  }

  async createCicdIntegration(
    integration: InsertCicdIntegration
  ): Promise<CicdIntegration> {
    const [newIntegration] = await db
      .insert(cicdIntegrations)
      .values(integration as CicdIntegrationInsert)
      .returning();
    return newIntegration;
  }

  async getCicdIntegrationById(
    id: string
  ): Promise<CicdIntegration | undefined> {
    const [integration] = await db
      .select()
      .from(cicdIntegrations)
      .where(eq(cicdIntegrations.id, id))
      .limit(1);
    return integration;
  }

  // CI/CD Run operations
  async createCicdRun(run: InsertCicdRun): Promise<CicdRun> {
    const [newRun] = await db
      .insert(cicdRuns)
      .values(run as CicdRunInsert)
      .returning();
    return newRun;
  }

  async getCicdRunById(id: string): Promise<CicdRun | undefined> {
    const [run] = await db
      .select()
      .from(cicdRuns)
      .where(eq(cicdRuns.id, id))
      .limit(1);
    return run;
  }

  async updateCicdRun(
    id: string,
    data: Partial<InsertCicdRun>
  ): Promise<CicdRun> {
    const [updatedRun] = await db
      .update(cicdRuns)
      .set(data)
      .where(eq(cicdRuns.id, id))
      .returning();
    return updatedRun;
  }

  // Webhook operations
  async createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent> {
    const [newEvent] = await db
      .insert(webhookEvents)
      .values(event as WebhookEventInsert)
      .returning();
    return newEvent;
  }

  // Alert operations
  async getAlertConfigs(organizationId: string): Promise<AlertConfig[]> {
    return await db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.organizationId, organizationId))
      .orderBy(desc(alertConfigs.createdAt));
  }

  async createAlertConfig(config: InsertAlertConfig): Promise<AlertConfig> {
    const [newConfig] = await db
      .insert(alertConfigs)
      .values(config as AlertConfigInsert)
      .returning();
    return newConfig;
  }

  async createAlertEvent(event: InsertAlertEvent): Promise<AlertEvent> {
    const [newEvent] = await db
      .insert(alertEvents)
      .values(event as AlertEventInsert)
      .returning();
    return newEvent;
  }

  async getAlertEvents(organizationId: string): Promise<AlertEvent[]> {
    return await db
      .select()
      .from(alertEvents)
      .where(eq(alertEvents.organizationId, organizationId))
      .orderBy(desc(alertEvents.createdAt));
  }

  async getAlertConfigById(id: string): Promise<AlertConfig | undefined> {
    const [config] = await db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.id, id))
      .limit(1);
    return config;
  }

  // Run operations (for alerts)
  async getRun(runId: string): Promise<Run | undefined> {
    const [run] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    return run;
  }

  async getRuns(organizationId: string, limit = 1000): Promise<Run[]> {
    return await db
      .select()
      .from(runs)
      .where(eq(runs.organizationId, organizationId))
      .orderBy(desc(runs.createdAt))
      .limit(limit);
  }

  async getRunsByEvalSpec(evalSpecId: string): Promise<Run[]> {
    return await db
      .select()
      .from(runs)
      .where(eq(runs.evalSpecId, evalSpecId))
      .orderBy(desc(runs.createdAt));
  }

  // Policy violation operations (for alerts)
  async getPolicyViolationsByRun(runId: string): Promise<PolicyViolation[]> {
    return await db
      .select()
      .from(policyViolations)
      .where(eq(policyViolations.runId, runId));
  }
}
