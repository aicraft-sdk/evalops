import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, jsonb, boolean, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, organizations } from "./core";
import { runs, datasets } from "./evaluation";

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

// Insert schemas for AI Provider tables - using 'as const' to fix type errors
export const insertAiProviderSchema = createInsertSchema(aiProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as const);

export const insertModelSchema = createInsertSchema(models).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as const);

export const insertOrganizationProviderConfigSchema = createInsertSchema(organizationProviderConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as const);

export const insertModelUsageSchema = createInsertSchema(modelUsage).omit({
  id: true,
  createdAt: true,
} as const);

export const insertProviderHealthCheckSchema = createInsertSchema(providerHealthChecks).omit({
  id: true,
  checkedAt: true,
} as const);

// Insert schemas for Model Registry tables
export const insertModelVersionSchema = createInsertSchema(modelVersions).omit({
  id: true,
  createdAt: true,
} as const);

export const insertModelBenchmarkSchema = createInsertSchema(modelBenchmarks).omit({
  id: true,
  createdAt: true,
} as const);

export const insertModelComparisonSchema = createInsertSchema(modelComparisons).omit({
  id: true,
  createdAt: true,
} as const);

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

