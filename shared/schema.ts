import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, jsonb, boolean, index, pgEnum, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("viewer"), // admin, editor, viewer
  organizationId: varchar("organization_id").notNull(),
  // Microsoft Entra ID integration fields
  entraId: varchar("entra_id").unique(), // Microsoft Entra ID user object ID
  upn: varchar("upn"), // User Principal Name from Entra ID
  tenantId: varchar("tenant_id"), // Entra ID tenant identifier
  department: varchar("department"),
  jobTitle: varchar("job_title"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User API Keys table (encrypted storage)
export const userApiKeys = pgTable("user_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  provider: varchar("provider").notNull(), // 'openai', 'azure-openai', etc.
  encryptedKey: text("encrypted_key").notNull(), // Encrypted API key
  keyHash: varchar("key_hash").notNull(), // Hash for validation
  displayName: varchar("display_name"), // User-friendly name
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Organizations table
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Prompts table
export const prompts = pgTable("prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  version: varchar("version").notNull(),
  content: text("content").notNull(), // Supports {{variable}} template syntax
  category: varchar("category").notNull().default('general'), // 'general', 'llm_judge', 'evaluation', 'system'
  contentHash: varchar("content_hash").notNull().unique(),
  metadata: jsonb("metadata").default({}),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Flows table (Prompt Flow references)
export const flows = pgTable("flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  version: varchar("version").notNull(),
  flowId: varchar("flow_id").notNull(), // External Prompt Flow ID
  workspaceId: varchar("workspace_id").notNull(),
  parameters: jsonb("parameters").default({}),
  contentHash: varchar("content_hash").notNull().unique(),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Datasets table
export const datasets = pgTable("datasets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  version: varchar("version").notNull(),
  description: text("description"),
  schema: jsonb("schema"),
  sampleCount: integer("sample_count").notNull(),
  contentHash: varchar("content_hash").notNull().unique(),
  storageUrl: varchar("storage_url").notNull(), // File storage location
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Dataset samples table
export const datasetSamples = pgTable("dataset_samples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetId: varchar("dataset_id").notNull().references(() => datasets.id),
  sampleIndex: integer("sample_index").notNull(),
  input: jsonb("input").notNull(),
  expected: jsonb("expected"),
  metadata: jsonb("metadata").default({}),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Eval Specs table
export const evalSpecs = pgTable("eval_specs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  version: varchar("version").notNull(),
  description: text("description"),
  promptId: varchar("prompt_id"),
  flowId: varchar("flow_id"),
  datasetId: varchar("dataset_id").notNull(),
  evaluators: jsonb("evaluators").notNull(), // Array of evaluator configs with template support
  repetitions: integer("repetitions").notNull().default(3),
  seeds: jsonb("seeds").notNull(), // Array of random seeds
  modelConfig: jsonb("model_config").notNull(),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Runs table
export const runs = pgTable("runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // User-provided name for the run
  evalSpecId: varchar("eval_spec_id").notNull(),
  policyId: varchar("policy_id"), // optional - can be null for runs without specific policy
  status: varchar("status").notNull(), // pending, running, completed, failed
  decision: varchar("decision"), // pass, warn, fail
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  metrics: jsonb("metrics"),
  cost: real("cost"),
  duration: integer("duration"), // seconds
  errorMessage: text("error_message"),
  triggeredBy: varchar("triggered_by").notNull(),
  commitSha: varchar("commit_sha"),
  organizationId: varchar("organization_id").notNull(),
  description: text("description"), // optional description
  createdAt: timestamp("created_at").defaultNow(),
});

// Baselines table
export const baselines = pgTable("baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evalSpecId: varchar("eval_spec_id").notNull(),
  runId: varchar("run_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  metrics: jsonb("metrics").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Policies table
export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  rules: jsonb("rules").notNull(), // Array of policy rules
  isActive: boolean("is_active").notNull().default(true),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Policy Violations table
export const policyViolations = pgTable("policy_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  policyId: varchar("policy_id").notNull(),
  ruleIndex: integer("rule_index").notNull(),
  severity: varchar("severity").notNull(), // warn, fail
  message: text("message").notNull(),
  evidence: jsonb("evidence"),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Sample Results table - stores individual evaluation sample results
export const sampleResults = pgTable("sample_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  sampleIndex: integer("sample_index").notNull(),
  repetition: integer("repetition").notNull(),
  input: jsonb("input").notNull(),
  expectedOutput: jsonb("expected_output"),
  actualOutput: jsonb("actual_output"),
  evaluationResults: jsonb("evaluation_results").notNull(), // { exactMatch: 1, cost: 0.001, latency: 1200 }
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit Trail table
export const auditTrail = pgTable("audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: varchar("action").notNull(), // create, update, delete
  changes: jsonb("changes"),
  userId: varchar("user_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const userRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  prompts: many(prompts),
  flows: many(flows),
  datasets: many(datasets),
  evalSpecs: many(evalSpecs),
  baselines: many(baselines),
  policies: many(policies),
}));

export const organizationRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  prompts: many(prompts),
  flows: many(flows),
  datasets: many(datasets),
  evalSpecs: many(evalSpecs),
  runs: many(runs),
  baselines: many(baselines),
  policies: many(policies),
}));

export const promptRelations = relations(prompts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [prompts.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [prompts.createdBy],
    references: [users.id],
  }),
  evalSpecs: many(evalSpecs),
}));

export const flowRelations = relations(flows, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [flows.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [flows.createdBy],
    references: [users.id],
  }),
  evalSpecs: many(evalSpecs),
}));

export const datasetRelations = relations(datasets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [datasets.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [datasets.createdBy],
    references: [users.id],
  }),
  evalSpecs: many(evalSpecs),
}));

export const evalSpecRelations = relations(evalSpecs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [evalSpecs.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [evalSpecs.createdBy],
    references: [users.id],
  }),
  prompt: one(prompts, {
    fields: [evalSpecs.promptId],
    references: [prompts.id],
  }),
  flow: one(flows, {
    fields: [evalSpecs.flowId],
    references: [flows.id],
  }),
  dataset: one(datasets, {
    fields: [evalSpecs.datasetId],
    references: [datasets.id],
  }),
  runs: many(runs),
  baselines: many(baselines),
}));

export const runRelations = relations(runs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [runs.organizationId],
    references: [organizations.id],
  }),
  evalSpec: one(evalSpecs, {
    fields: [runs.evalSpecId],
    references: [evalSpecs.id],
  }),
  policy: one(policies, {
    fields: [runs.policyId],
    references: [policies.id],
  }),
  triggeredByUser: one(users, {
    fields: [runs.triggeredBy],
    references: [users.id],
  }),
  policyViolations: many(policyViolations),
}));

export const baselineRelations = relations(baselines, ({ one }) => ({
  organization: one(organizations, {
    fields: [baselines.organizationId],
    references: [organizations.id],
  }),
  evalSpec: one(evalSpecs, {
    fields: [baselines.evalSpecId],
    references: [evalSpecs.id],
  }),
  run: one(runs, {
    fields: [baselines.runId],
    references: [runs.id],
  }),
  createdByUser: one(users, {
    fields: [baselines.createdBy],
    references: [users.id],
  }),
}));

export const policyRelations = relations(policies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policies.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [policies.createdBy],
    references: [users.id],
  }),
  violations: many(policyViolations),
}));

export const policyViolationRelations = relations(policyViolations, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyViolations.organizationId],
    references: [organizations.id],
  }),
  run: one(runs, {
    fields: [policyViolations.runId],
    references: [runs.id],
  }),
  policy: one(policies, {
    fields: [policyViolations.policyId],
    references: [policies.id],
  }),
}));

export const auditTrailRelations = relations(auditTrail, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditTrail.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditTrail.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPromptSchema = createInsertSchema(prompts).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

export const insertFlowSchema = createInsertSchema(flows).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

export const insertDatasetSchema = createInsertSchema(datasets).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

export const insertDatasetSampleSchema = createInsertSchema(datasetSamples).omit({
  id: true,
  createdAt: true,
});

export const insertEvalSpecSchema = createInsertSchema(evalSpecs).omit({
  id: true,
  createdAt: true,
});

export const insertRunSchema = createInsertSchema(runs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

export const insertBaselineSchema = createInsertSchema(baselines).omit({
  id: true,
  createdAt: true,
});

export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPolicyViolationSchema = createInsertSchema(policyViolations).omit({
  id: true,
  createdAt: true,
});

export const insertSampleResultSchema = createInsertSchema(sampleResults).omit({
  id: true,
  createdAt: true,
});

export const insertAuditTrailSchema = createInsertSchema(auditTrail).omit({
  id: true,
  createdAt: true,
});

export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type Prompt = typeof prompts.$inferSelect;
export type InsertPrompt = z.infer<typeof insertPromptSchema>;

export type Flow = typeof flows.$inferSelect;
export type InsertFlow = z.infer<typeof insertFlowSchema>;

export type Dataset = typeof datasets.$inferSelect;
export type InsertDataset = z.infer<typeof insertDatasetSchema>;

export type InsertDatasetSample = z.infer<typeof insertDatasetSampleSchema>;
export type DatasetSample = typeof datasetSamples.$inferSelect;

export type EvalSpec = typeof evalSpecs.$inferSelect;
export type InsertEvalSpec = z.infer<typeof insertEvalSpecSchema>;

export type Run = typeof runs.$inferSelect;
export type InsertRun = z.infer<typeof insertRunSchema>;

export type Baseline = typeof baselines.$inferSelect;
export type InsertBaseline = z.infer<typeof insertBaselineSchema>;

export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = z.infer<typeof insertPolicySchema>;

export type PolicyViolation = typeof policyViolations.$inferSelect;
export type InsertPolicyViolation = z.infer<typeof insertPolicyViolationSchema>;

export type SampleResult = typeof sampleResults.$inferSelect;
export type InsertSampleResult = z.infer<typeof insertSampleResultSchema>;

export type AuditTrail = typeof auditTrail.$inferSelect;
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;

// Enhanced audit entry with resolved user and entity information
export type EnhancedAuditEntry = AuditTrail & {
  userName: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  entityName: string;
  description: string;
};

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;

// CI/CD Integration Schema

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

// AI Provider Management Schema

// Enum for AI provider types (aligned with AI SDK providers)
export const aiProviderTypeEnum = pgEnum('ai_provider_type', [
  'openai', 'anthropic', 'azure_openai', 'google', 'google_gemini', 'xai', 'custom'
]);

// Enum for model capabilities
export const modelCapabilityEnum = pgEnum('model_capability', [
  'text_generation', 'image_analysis', 'function_calling', 'json_mode', 'streaming'
]);

// AI Providers table - stores supported AI providers and their configurations
export const aiProviders = pgTable("ai_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "OpenAI", "Anthropic", etc.
  type: aiProviderTypeEnum("type").notNull(),
  aiSdkProvider: varchar("ai_sdk_provider"), // AI SDK provider identifier (e.g., "openai", "anthropic")
  baseUrl: varchar("base_url"), // API base URL
  authMethod: varchar("auth_method").notNull().default('api_key'), // 'api_key', 'oauth', 'azure_key'
  supportedCapabilities: jsonb("supported_capabilities").notNull().default([]), // Array of capabilities
  defaultConfig: jsonb("default_config").default({}), // Default model parameters
  aiSdkConfig: jsonb("ai_sdk_config").default({}), // AI SDK-specific configuration
  costPerToken: jsonb("cost_per_token").default({}), // Token costs by model
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0), // For failover ordering
  healthStatus: varchar("health_status").notNull().default('unknown'), // 'healthy', 'degraded', 'down'
  lastHealthCheck: timestamp("last_health_check"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Models table - stores available models for each provider
export const models = pgTable("models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull(),
  name: varchar("name").notNull(), // "gpt-4", "claude-3-sonnet", etc.
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  capabilities: jsonb("capabilities").notNull().default([]), // Array of supported capabilities
  contextWindow: integer("context_window"),
  maxTokens: integer("max_tokens"),
  inputCostPer1k: real("input_cost_per_1k"), // Cost per 1K input tokens
  outputCostPer1k: real("output_cost_per_1k"), // Cost per 1K output tokens
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").default({}), // Additional model-specific info
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Organization Provider Configs - per-org provider settings
export const organizationProviderConfigs = pgTable("organization_provider_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  providerId: varchar("provider_id").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0), // Failover priority
  config: jsonb("config").default({}), // Org-specific provider config
  credentials: jsonb("credentials"), // Encrypted credentials reference
  quotas: jsonb("quotas").default({}), // Usage quotas and limits
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Model Usage Tracking - track usage and costs per model
export const modelUsage = pgTable("model_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  providerId: varchar("provider_id").notNull(),
  modelId: varchar("model_id").notNull(),
  runId: varchar("run_id"),
  date: timestamp("date").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  avgLatency: real("avg_latency"), // Average response time in ms
  createdAt: timestamp("created_at").defaultNow(),
});

// Provider Health Checks - track provider availability and performance
export const providerHealthChecks = pgTable("provider_health_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull(),
  status: varchar("status").notNull(), // 'healthy', 'degraded', 'down'
  responseTime: real("response_time"), // Response time in ms
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at").defaultNow(),
});

// Model Version History - track model versions and changes over time
export const modelVersions = pgTable("model_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id),
  version: varchar("version").notNull(),
  releaseDate: timestamp("release_date"),
  changeLog: text("change_log"),
  isActive: boolean("is_active").notNull().default(true),
  isDeprecated: boolean("is_deprecated").notNull().default(false),
  deprecationNotice: text("deprecation_notice"),
  capabilities: jsonb("capabilities").notNull().default([]),
  contextWindow: integer("context_window"),
  maxTokens: integer("max_tokens"),
  inputCostPer1k: real("input_cost_per_1k"),
  outputCostPer1k: real("output_cost_per_1k"),
  benchmarkScores: jsonb("benchmark_scores").default({}),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// Model Performance Benchmarks - track standardized benchmark scores
export const modelBenchmarks = pgTable("model_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id),
  versionId: varchar("version_id").references(() => modelVersions.id),
  benchmarkName: varchar("benchmark_name").notNull(), // MMLU, HumanEval, GSM8K, etc.
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
  scoreType: varchar("score_type").notNull().default('percentage'), // 'percentage', 'accuracy', 'pass_rate'
  testDate: timestamp("test_date").notNull(),
  testConditions: jsonb("test_conditions").default({}), // temperature, prompt format, etc.
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// Model Comparison Results - track side-by-side model comparisons
export const modelComparisons = pgTable("model_comparisons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  baseModelId: varchar("base_model_id").notNull().references(() => models.id),
  compareModelId: varchar("compare_model_id").notNull().references(() => models.id),
  datasetId: varchar("dataset_id").references(() => datasets.id),
  comparisonType: varchar("comparison_type").notNull(), // 'accuracy', 'cost', 'latency', 'quality'
  results: jsonb("results").notNull().default({}),
  summary: text("summary"),
  winnerModelId: varchar("winner_model_id").references(() => models.id),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations for AI Provider tables
export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  models: many(models),
  organizationConfigs: many(organizationProviderConfigs),
  healthChecks: many(providerHealthChecks),
  usage: many(modelUsage),
}));

export const modelsRelations = relations(models, ({ one, many }) => ({
  provider: one(aiProviders, {
    fields: [models.providerId],
    references: [aiProviders.id]
  }),
  usage: many(modelUsage),
  versions: many(modelVersions),
  benchmarks: many(modelBenchmarks),
  baseComparisons: many(modelComparisons, { relationName: "baseModel" }),
  compareComparisons: many(modelComparisons, { relationName: "compareModel" }),
  winnerComparisons: many(modelComparisons, { relationName: "winnerModel" }),
}));

export const modelVersionsRelations = relations(modelVersions, ({ one, many }) => ({
  model: one(models, {
    fields: [modelVersions.modelId],
    references: [models.id]
  }),
  benchmarks: many(modelBenchmarks),
}));

export const modelBenchmarksRelations = relations(modelBenchmarks, ({ one }) => ({
  model: one(models, {
    fields: [modelBenchmarks.modelId],
    references: [models.id]
  }),
  version: one(modelVersions, {
    fields: [modelBenchmarks.versionId],
    references: [modelVersions.id]
  }),
}));

export const modelComparisonsRelations = relations(modelComparisons, ({ one }) => ({
  organization: one(organizations, {
    fields: [modelComparisons.organizationId],
    references: [organizations.id]
  }),
  baseModel: one(models, {
    relationName: "baseModel",
    fields: [modelComparisons.baseModelId],
    references: [models.id]
  }),
  compareModel: one(models, {
    relationName: "compareModel",
    fields: [modelComparisons.compareModelId],
    references: [models.id]
  }),
  winnerModel: one(models, {
    relationName: "winnerModel",
    fields: [modelComparisons.winnerModelId],
    references: [models.id]
  }),
  dataset: one(datasets, {
    fields: [modelComparisons.datasetId],
    references: [datasets.id]
  }),
  createdByUser: one(users, {
    fields: [modelComparisons.createdBy],
    references: [users.id]
  }),
}));

export const organizationProviderConfigsRelations = relations(organizationProviderConfigs, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationProviderConfigs.organizationId],
    references: [organizations.id]
  }),
  provider: one(aiProviders, {
    fields: [organizationProviderConfigs.providerId],
    references: [aiProviders.id]
  }),
  createdByUser: one(users, {
    fields: [organizationProviderConfigs.createdBy],
    references: [users.id]
  }),
}));

export const modelUsageRelations = relations(modelUsage, ({ one }) => ({
  organization: one(organizations, {
    fields: [modelUsage.organizationId],
    references: [organizations.id]
  }),
  provider: one(aiProviders, {
    fields: [modelUsage.providerId],
    references: [aiProviders.id]
  }),
  model: one(models, {
    fields: [modelUsage.modelId],
    references: [models.id]
  }),
  run: one(runs, {
    fields: [modelUsage.runId],
    references: [runs.id]
  }),
}));

export const providerHealthChecksRelations = relations(providerHealthChecks, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [providerHealthChecks.providerId],
    references: [aiProviders.id]
  }),
}));

// Insert schemas for CI/CD tables
export const insertCicdIntegrationSchema = createInsertSchema(cicdIntegrations);
export const insertCicdRunSchema = createInsertSchema(cicdRuns);
export const insertWebhookEventSchema = createInsertSchema(webhookEvents);
export const insertAlertConfigSchema = createInsertSchema(alertConfigs);
export const insertAlertEventSchema = createInsertSchema(alertEvents);

// Insert schemas for AI Provider tables
export const insertAiProviderSchema = createInsertSchema(aiProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModelSchema = createInsertSchema(models).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationProviderConfigSchema = createInsertSchema(organizationProviderConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModelUsageSchema = createInsertSchema(modelUsage).omit({
  id: true,
  createdAt: true,
});

export const insertProviderHealthCheckSchema = createInsertSchema(providerHealthChecks).omit({
  id: true,
  checkedAt: true,
});

// Insert schemas for Model Registry tables
export const insertModelVersionSchema = createInsertSchema(modelVersions).omit({
  id: true,
  createdAt: true,
});

export const insertModelBenchmarkSchema = createInsertSchema(modelBenchmarks).omit({
  id: true,
  createdAt: true,
});

export const insertModelComparisonSchema = createInsertSchema(modelComparisons).omit({
  id: true,
  createdAt: true,
});

// Types for AI Provider tables
export type AiProvider = typeof aiProviders.$inferSelect;
export type InsertAiProvider = z.infer<typeof insertAiProviderSchema>;

export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;

export type OrganizationProviderConfig = typeof organizationProviderConfigs.$inferSelect;
export type InsertOrganizationProviderConfig = z.infer<typeof insertOrganizationProviderConfigSchema>;

export type ModelUsage = typeof modelUsage.$inferSelect;
export type InsertModelUsage = z.infer<typeof insertModelUsageSchema>;

export type ProviderHealthCheck = typeof providerHealthChecks.$inferSelect;
export type InsertProviderHealthCheck = z.infer<typeof insertProviderHealthCheckSchema>;

// Types for Model Registry tables
export type ModelVersion = typeof modelVersions.$inferSelect;
export type InsertModelVersion = z.infer<typeof insertModelVersionSchema>;

export type ModelBenchmark = typeof modelBenchmarks.$inferSelect;
export type InsertModelBenchmark = z.infer<typeof insertModelBenchmarkSchema>;

export type ModelComparison = typeof modelComparisons.$inferSelect;
export type InsertModelComparison = z.infer<typeof insertModelComparisonSchema>;

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

// ============= CUSTOM EVALUATOR REGISTRY =============

// Evaluator status enum
export const evaluatorStatusEnum = pgEnum("evaluator_status", [
  "active", "disabled", "pending_validation", "validation_failed"
]);

// Custom evaluators table - user-uploaded evaluators
export const customEvaluators = pgTable("custom_evaluators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  version: varchar("version").notNull().default("1.0.0"),
  
  // Evaluator metadata
  evaluatorType: varchar("evaluator_type").notNull(), // "similarity", "classification", "grading", etc.
  inputSchema: jsonb("input_schema"), // JSON schema for inputs
  outputSchema: jsonb("output_schema"), // JSON schema for outputs
  
  // File storage
  fileName: varchar("file_name").notNull(),
  fileHash: varchar("file_hash").notNull(), // SHA-256 hash for integrity
  fileSize: integer("file_size").notNull(),
  filePath: varchar("file_path").notNull(), // Object storage path
  
  // Status and validation
  status: evaluatorStatusEnum("status").notNull().default("pending_validation"),
  validationResults: jsonb("validation_results"), // Validation test results
  validationError: text("validation_error"),
  
  // Metadata
  tags: jsonb("tags").default([]), // Array of tags for categorization
  usage: jsonb("usage").default({}), // Usage statistics
  
  // Ownership and audit
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  isPublic: boolean("is_public").default(false), // Can be shared across orgs
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_custom_evaluators_org").on(table.organizationId),
  index("idx_custom_evaluators_status").on(table.status),
  index("idx_custom_evaluators_type").on(table.evaluatorType),
  index("idx_custom_evaluators_hash").on(table.fileHash)
]);

// Evaluator versions table - version history
export const evaluatorVersions = pgTable("evaluator_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evaluatorId: varchar("evaluator_id").notNull().references(() => customEvaluators.id),
  version: varchar("version").notNull(),
  fileName: varchar("file_name").notNull(),
  fileHash: varchar("file_hash").notNull(),
  filePath: varchar("file_path").notNull(),
  
  // Change tracking
  changeLog: text("change_log"),
  previousVersionId: varchar("previous_version_id").references(() => evaluatorVersions.id),
  
  // Status
  status: evaluatorStatusEnum("status").notNull().default("pending_validation"),
  validationResults: jsonb("validation_results"),
  
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_evaluator_versions_evaluator").on(table.evaluatorId),
  index("idx_evaluator_versions_version").on(table.evaluatorId, table.version)
]);

// Evaluator usage tracking
export const evaluatorUsage = pgTable("evaluator_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evaluatorId: varchar("evaluator_id").notNull().references(() => customEvaluators.id),
  runId: varchar("run_id").references(() => runs.id),
  
  // Usage metrics
  executionTime: integer("execution_time"), // milliseconds
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cost: decimal("cost", { precision: 10, scale: 4 }),
  
  // Result metrics
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  
  organizationId: varchar("organization_id").notNull(),
  usedBy: varchar("used_by").notNull(),
  usedAt: timestamp("used_at").defaultNow(),
}, (table) => [
  index("idx_evaluator_usage_evaluator").on(table.evaluatorId),
  index("idx_evaluator_usage_run").on(table.runId),
  index("idx_evaluator_usage_org_date").on(table.organizationId, table.usedAt)
]);

// ============= ENTERPRISE PERMISSION SYSTEM =============

// Resource types enum for granular permissions
export const resourceTypeEnum = pgEnum("resource_type", [
  "organization", "dataset", "prompt", "flow", "eval_spec", "run", "model", "provider", "policy", "baseline"
]);

// Permission actions enum
export const permissionActionEnum = pgEnum("permission_action", [
  "read", "write", "delete", "execute", "manage", "admin"
]);

// Roles table - defines organizational roles with hierarchies
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Admin", "Data Scientist", "ML Engineer", etc.
  description: text("description"),
  organizationId: varchar("organization_id").notNull(),
  isSystemRole: boolean("is_system_role").default(false), // Built-in roles vs custom roles
  priority: integer("priority").default(0), // Higher priority roles override lower ones
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [index("idx_roles_org").on(table.organizationId)]);

// User role assignments - many-to-many relationship
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  index("idx_user_roles_user").on(table.userId),
  index("idx_user_roles_role").on(table.roleId)
]);

// Permissions table - defines specific permission capabilities
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "datasets.read", "eval_specs.execute", etc.
  resourceType: resourceTypeEnum("resource_type").notNull(),
  action: permissionActionEnum("action").notNull(),
  description: text("description"),
  isSystemPermission: boolean("is_system_permission").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_permissions_resource_action").on(table.resourceType, table.action)
]);

// Role permissions - what permissions each role has
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_role_permissions_role").on(table.roleId),
  index("idx_role_permissions_permission").on(table.permissionId)
]);

// Resource permissions - fine-grained permissions on specific resources
export const resourcePermissions = pgTable("resource_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  roleId: varchar("role_id").references(() => roles.id), 
  resourceType: resourceTypeEnum("resource_type").notNull(),
  resourceId: varchar("resource_id").notNull(), // ID of the specific resource
  action: permissionActionEnum("action").notNull(),
  granted: boolean("granted").notNull().default(true), // true = grant, false = deny
  grantedBy: varchar("granted_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_resource_permissions_user").on(table.userId),
  index("idx_resource_permissions_resource").on(table.resourceType, table.resourceId),
  index("idx_resource_permissions_role").on(table.roleId)
]);

// Audit log for permission changes
export const permissionAuditLog = pgTable("permission_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: varchar("action").notNull(), // "grant", "revoke", "role_assigned", etc.
  userId: varchar("user_id").references(() => users.id),
  targetUserId: varchar("target_user_id").references(() => users.id),
  resourceType: resourceTypeEnum("resource_type"),
  resourceId: varchar("resource_id"),
  permission: permissionActionEnum("permission"),
  roleId: varchar("role_id").references(() => roles.id),
  details: jsonb("details").default({}),
  performedBy: varchar("performed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_permission_audit_user").on(table.userId),
  index("idx_permission_audit_date").on(table.createdAt)
]);

// ============= AZURE ML INTEGRATION TABLES =============

// Azure subscriptions that users have access to
export const azureSubscriptions = pgTable("azure_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  subscriptionId: varchar("subscription_id").notNull(), // Azure subscription ID
  displayName: varchar("display_name").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  state: varchar("state").notNull().default('enabled'), // enabled, disabled, warned
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_azure_subscription_user").on(table.userId),
  index("idx_azure_subscription_id").on(table.subscriptionId)
]);

// Azure ML workspaces discovered in user's subscriptions
export const azureMLWorkspaces = pgTable("azure_ml_workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  azureSubscriptionId: varchar("azure_subscription_id").notNull().references(() => azureSubscriptions.id),
  workspaceName: varchar("workspace_name").notNull(),
  resourceGroup: varchar("resource_group").notNull(),
  region: varchar("region").notNull(),
  description: text("description"),
  discoveryVersion: varchar("discovery_version"), // API version used for discovery
  sku: varchar("sku"), // Basic, Standard, Premium
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_azure_workspace_subscription").on(table.azureSubscriptionId),
  index("idx_azure_workspace_name").on(table.workspaceName)
]);

// Azure deployments (models, endpoints) within workspaces
export const azureDeployments = pgTable("azure_deployments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  azureWorkspaceId: varchar("azure_workspace_id").notNull().references(() => azureMLWorkspaces.id),
  deploymentName: varchar("deployment_name").notNull(),
  endpointName: varchar("endpoint_name"),
  deploymentType: varchar("deployment_type").notNull(), // 'online', 'batch', 'serverless'
  modelName: varchar("model_name"),
  modelVersion: varchar("model_version"),
  endpointUrl: text("endpoint_url"),
  status: varchar("status").notNull().default('unknown'), // 'creating', 'succeeded', 'failed', 'updating'
  sku: jsonb("sku"), // Capacity and pricing tier info
  properties: jsonb("properties").default({}), // Additional Azure properties
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_azure_deployment_workspace").on(table.azureWorkspaceId),
  index("idx_azure_deployment_name").on(table.deploymentName),
  index("idx_azure_deployment_type").on(table.deploymentType)
]);

// Azure Prompt Flows discovered and imported
export const azurePromptFlows = pgTable("azure_prompt_flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  azureWorkspaceId: varchar("azure_workspace_id").notNull().references(() => azureMLWorkspaces.id),
  flowName: varchar("flow_name").notNull(),
  flowVersion: varchar("flow_version"),
  azureFlowId: varchar("azure_flow_id").notNull(), // Azure's internal flow ID
  description: text("description"),
  flowType: varchar("flow_type").default('standard'), // 'standard', 'chat', 'evaluation'
  endpointUrl: text("endpoint_url"), // If deployed as endpoint
  endpointName: varchar("endpoint_name"), // Deployment endpoint name
  status: varchar("status").notNull().default('discovered'), // 'discovered', 'imported', 'deployed', 'failed'
  flowDefinition: jsonb("flow_definition"), // Cached flow definition from Azure
  inputSchema: jsonb("input_schema"), // Expected input format
  outputSchema: jsonb("output_schema"), // Expected output format
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_azure_flow_workspace").on(table.azureWorkspaceId),
  index("idx_azure_flow_name").on(table.flowName),
  index("idx_azure_flow_status").on(table.status)
]);

// Azure OpenAI accounts and their deployments  
export const azureOpenAIAccounts = pgTable("azure_openai_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  azureSubscriptionId: varchar("azure_subscription_id").notNull().references(() => azureSubscriptions.id),
  accountName: varchar("account_name").notNull(),
  resourceGroup: varchar("resource_group").notNull(),
  region: varchar("region").notNull(),
  endpoint: text("endpoint").notNull(), // https://accountname.openai.azure.com/
  apiVersion: varchar("api_version").notNull().default('2024-10-21'),
  sku: varchar("sku"), // S0, etc.
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_azure_openai_subscription").on(table.azureSubscriptionId),
  index("idx_azure_openai_account").on(table.accountName)
]);

// Azure OpenAI model deployments within accounts
export const azureOpenAIDeployments = pgTable("azure_openai_deployments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  azureOpenAIAccountId: varchar("azure_openai_account_id").notNull().references(() => azureOpenAIAccounts.id),
  deploymentName: varchar("deployment_name").notNull(),
  modelName: varchar("model_name").notNull(), // gpt-4, gpt-35-turbo, etc.
  modelVersion: varchar("model_version"), // Version of the model
  scaleType: varchar("scale_type"), // Standard, Manual, etc.
  currentCapacity: integer("current_capacity"),
  raiPolicyName: varchar("rai_policy_name"), // Responsible AI policy
  status: varchar("status").notNull().default('unknown'), // 'succeeded', 'failed', 'creating'
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_azure_openai_deployment_account").on(table.azureOpenAIAccountId),
  index("idx_azure_openai_deployment_name").on(table.deploymentName)
]);

// ============= PERMISSION SYSTEM TYPES =============

export type Role = typeof roles.$inferSelect;
export const insertRoleSchema = createInsertSchema(roles);
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type UserRole = typeof userRoles.$inferSelect;
export const insertUserRoleSchema = createInsertSchema(userRoles);
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;

export type Permission = typeof permissions.$inferSelect;
export const insertPermissionSchema = createInsertSchema(permissions);
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

export type RolePermission = typeof rolePermissions.$inferSelect;
export const insertRolePermissionSchema = createInsertSchema(rolePermissions);
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;

export type ResourcePermission = typeof resourcePermissions.$inferSelect;
export const insertResourcePermissionSchema = createInsertSchema(resourcePermissions);
export type InsertResourcePermission = z.infer<typeof insertResourcePermissionSchema>;

export type PermissionAuditLog = typeof permissionAuditLog.$inferSelect;
export const insertPermissionAuditLogSchema = createInsertSchema(permissionAuditLog);
export type InsertPermissionAuditLog = z.infer<typeof insertPermissionAuditLogSchema>;

// ============= CUSTOM EVALUATOR TYPES =============

export type CustomEvaluator = typeof customEvaluators.$inferSelect;
export const insertCustomEvaluatorSchema = createInsertSchema(customEvaluators).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCustomEvaluator = z.infer<typeof insertCustomEvaluatorSchema>;

export type EvaluatorVersion = typeof evaluatorVersions.$inferSelect;
export const insertEvaluatorVersionSchema = createInsertSchema(evaluatorVersions).omit({
  id: true,
  createdAt: true
});
export type InsertEvaluatorVersion = z.infer<typeof insertEvaluatorVersionSchema>;

export type EvaluatorUsage = typeof evaluatorUsage.$inferSelect;
export const insertEvaluatorUsageSchema = createInsertSchema(evaluatorUsage).omit({
  id: true
});
export type InsertEvaluatorUsage = z.infer<typeof insertEvaluatorUsageSchema>;

// ============= AZURE ML INTEGRATION TYPES =============

export type AzureSubscription = typeof azureSubscriptions.$inferSelect;
export const insertAzureSubscriptionSchema = createInsertSchema(azureSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAzureSubscription = z.infer<typeof insertAzureSubscriptionSchema>;

export type AzureMLWorkspace = typeof azureMLWorkspaces.$inferSelect;
export const insertAzureMLWorkspaceSchema = createInsertSchema(azureMLWorkspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAzureMLWorkspace = z.infer<typeof insertAzureMLWorkspaceSchema>;

export type AzureDeployment = typeof azureDeployments.$inferSelect;
export const insertAzureDeploymentSchema = createInsertSchema(azureDeployments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAzureDeployment = z.infer<typeof insertAzureDeploymentSchema>;

export type AzurePromptFlow = typeof azurePromptFlows.$inferSelect;
export const insertAzurePromptFlowSchema = createInsertSchema(azurePromptFlows).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAzurePromptFlow = z.infer<typeof insertAzurePromptFlowSchema>;

export type AzureOpenAIAccount = typeof azureOpenAIAccounts.$inferSelect;
export const insertAzureOpenAIAccountSchema = createInsertSchema(azureOpenAIAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAzureOpenAIAccount = z.infer<typeof insertAzureOpenAIAccountSchema>;

export type AzureOpenAIDeployment = typeof azureOpenAIDeployments.$inferSelect;
export const insertAzureOpenAIDeploymentSchema = createInsertSchema(azureOpenAIDeployments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAzureOpenAIDeployment = z.infer<typeof insertAzureOpenAIDeploymentSchema>;
