import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { organizations } from "./core";
import { runs } from "./evaluation";

// Enum for CI/CD integration types
export const cicdIntegrationTypeEnum = pgEnum('cicd_integration_type', [
  'github', 'gitlab', 'bitbucket', 'azure_devops', 'jenkins', 'circleci'
]);

// Enum for CI/CD run status
export const cicdRunStatusEnum = pgEnum('cicd_run_status', [
  'pending', 'running', 'success', 'failure', 'cancelled'
]);

// Enum for alert severity
export const alertSeverityEnum = pgEnum('alert_severity', [
  'low', 'medium', 'high', 'critical'
]);

// CI/CD Integrations table
export const cicdIntegrations = pgTable("cicd_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: cicdIntegrationTypeEnum("type").notNull(),
  repositoryUrl: varchar("repository_url"),
  webhookSecret: varchar("webhook_secret"),
  config: jsonb("config").default({}), // Integration-specific configuration
  isActive: boolean("is_active").notNull().default(true),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CI/CD Runs table
export const cicdRuns = pgTable("cicd_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull(),
  runId: varchar("run_id"), // Associated evaluation run ID
  externalRunId: varchar("external_run_id"), // CI/CD system run ID
  branch: varchar("branch"),
  commit: varchar("commit"),
  pullRequestNumber: integer("pull_request_number"),
  status: cicdRunStatusEnum("status").notNull().default('pending'),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  qualityGateResult: varchar("quality_gate_result"), // 'pass', 'warn', 'fail'
  metadata: jsonb("metadata").default({}),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Webhook Events table
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull(),
  eventType: varchar("event_type").notNull(), // 'push', 'pull_request', 'merge', etc.
  payload: jsonb("payload").notNull(),
  signature: varchar("signature"), // Webhook signature for verification
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  error: text("error"), // Processing error if any
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Alert Configurations table
export const alertConfigs = pgTable("alert_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // 'policy_violation', 'run_failure', 'drift_detected', etc.
  severity: alertSeverityEnum("severity").notNull().default('medium'),
  conditions: jsonb("conditions").notNull(), // Alert trigger conditions
  channels: jsonb("channels").notNull(), // Notification channels (email, webhook, slack, etc.)
  isActive: boolean("is_active").notNull().default(true),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Alert Events table
export const alertEvents = pgTable("alert_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").default({}),
  notificationsSent: jsonb("notifications_sent").default([]), // Track which notifications were sent
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations for CI/CD tables
export const cicdIntegrationsRelations = relations(cicdIntegrations, ({ many, one }) => ({
  cicdRuns: many(cicdRuns),
  webhookEvents: many(webhookEvents),
  organization: one(organizations, {
    fields: [cicdIntegrations.organizationId],
    references: [organizations.id]
  })
}));

export const cicdRunsRelations = relations(cicdRuns, ({ one }) => ({
  integration: one(cicdIntegrations, {
    fields: [cicdRuns.integrationId],
    references: [cicdIntegrations.id]
  }),
  run: one(runs, {
    fields: [cicdRuns.runId],
    references: [runs.id]
  })
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  integration: one(cicdIntegrations, {
    fields: [webhookEvents.integrationId],
    references: [cicdIntegrations.id]
  })
}));

export const alertConfigsRelations = relations(alertConfigs, ({ many, one }) => ({
  events: many(alertEvents),
  organization: one(organizations, {
    fields: [alertConfigs.organizationId],
    references: [organizations.id]
  })
}));

export const alertEventsRelations = relations(alertEvents, ({ one }) => ({
  config: one(alertConfigs, {
    fields: [alertEvents.configId],
    references: [alertConfigs.id]
  })
}));

// Insert schemas
export const insertCicdIntegrationSchema = createInsertSchema(cicdIntegrations);
export const insertCicdRunSchema = createInsertSchema(cicdRuns);
export const insertWebhookEventSchema = createInsertSchema(webhookEvents);
export const insertAlertConfigSchema = createInsertSchema(alertConfigs);
export const insertAlertEventSchema = createInsertSchema(alertEvents);

// Types for CI/CD tables
export type CicdIntegration = typeof cicdIntegrations.$inferSelect;
export type InsertCicdIntegration = z.infer<typeof insertCicdIntegrationSchema>;

export type CicdRun = typeof cicdRuns.$inferSelect;
export type InsertCicdRun = z.infer<typeof insertCicdRunSchema>;

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type InsertAlertConfig = z.infer<typeof insertAlertConfigSchema>;

export type AlertEvent = typeof alertEvents.$inferSelect;
export type InsertAlertEvent = z.infer<typeof insertAlertEventSchema>;

