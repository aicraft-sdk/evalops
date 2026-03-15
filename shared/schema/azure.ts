import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./core";

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

// Insert schemas - using 'as const' to fix type errors
export type AzureSubscription = typeof azureSubscriptions.$inferSelect;
export const insertAzureSubscriptionSchema = createInsertSchema(azureSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
} as const);
export type InsertAzureSubscription = z.infer<typeof insertAzureSubscriptionSchema>;

export type AzureMLWorkspace = typeof azureMLWorkspaces.$inferSelect;
export const insertAzureMLWorkspaceSchema = createInsertSchema(azureMLWorkspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true
} as const);
export type InsertAzureMLWorkspace = z.infer<typeof insertAzureMLWorkspaceSchema>;

export type AzureDeployment = typeof azureDeployments.$inferSelect;
export const insertAzureDeploymentSchema = createInsertSchema(azureDeployments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
} as const);
export type InsertAzureDeployment = z.infer<typeof insertAzureDeploymentSchema>;

export type AzurePromptFlow = typeof azurePromptFlows.$inferSelect;
export const insertAzurePromptFlowSchema = createInsertSchema(azurePromptFlows).omit({
  id: true,
  createdAt: true,
  updatedAt: true
} as const);
export type InsertAzurePromptFlow = z.infer<typeof insertAzurePromptFlowSchema>;

export type AzureOpenAIAccount = typeof azureOpenAIAccounts.$inferSelect;
export const insertAzureOpenAIAccountSchema = createInsertSchema(azureOpenAIAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true
} as const);
export type InsertAzureOpenAIAccount = z.infer<typeof insertAzureOpenAIAccountSchema>;

export type AzureOpenAIDeployment = typeof azureOpenAIDeployments.$inferSelect;
export const insertAzureOpenAIDeploymentSchema = createInsertSchema(azureOpenAIDeployments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
} as const);
export type InsertAzureOpenAIDeployment = z.infer<typeof insertAzureOpenAIDeploymentSchema>;

