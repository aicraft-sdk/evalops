import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  real,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users, organizations } from './core';

// Prompts table
export const prompts = pgTable('prompts', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  version: varchar('version').notNull(),
  content: text('content').notNull(), // Supports {{variable}} template syntax
  category: varchar('category').notNull().default('general'), // 'general', 'llm_judge', 'evaluation', 'system'
  contentHash: varchar('content_hash').notNull().unique(),
  metadata: jsonb('metadata').default({}),
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Flows table (Prompt Flow references)
export const flows = pgTable('flows', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  version: varchar('version').notNull(),
  flowId: varchar('flow_id').notNull(), // External Prompt Flow ID
  workspaceId: varchar('workspace_id').notNull(),
  parameters: jsonb('parameters').default({}),
  contentHash: varchar('content_hash').notNull().unique(),
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Datasets table
export const datasets = pgTable('datasets', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  version: varchar('version').notNull(),
  description: text('description'),
  schema: jsonb('schema'),
  sampleCount: integer('sample_count').notNull(),
  contentHash: varchar('content_hash').notNull().unique(),
  storageUrl: varchar('storage_url').notNull(), // File storage location
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Dataset samples table
export const datasetSamples = pgTable('dataset_samples', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  datasetId: varchar('dataset_id')
    .notNull()
    .references(() => datasets.id),
  sampleIndex: integer('sample_index').notNull(),
  input: jsonb('input').notNull(),
  expected: jsonb('expected'),
  metadata: jsonb('metadata').default({}),
  organizationId: varchar('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Eval Specs table
export const evalSpecs = pgTable('eval_specs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  version: varchar('version').notNull(),
  description: text('description'),
  promptId: varchar('prompt_id'),
  flowId: varchar('flow_id'),
  // Agent target support: set agentId to target an AgentMD-defined agent
  agentId: varchar('agent_id'), // References agents.id — nullable for prompt/flow specs
  agentVersion: varchar('agent_version', { length: 50 }), // Pinned version
  datasetId: varchar('dataset_id').notNull(),
  evaluators: jsonb('evaluators').notNull(), // Array of evaluator configs with template support
  repetitions: integer('repetitions').notNull().default(3),
  seeds: jsonb('seeds').notNull(), // Array of random seeds
  modelConfig: jsonb('model_config').notNull(),
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Runs table
export const runs = pgTable('runs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(), // User-provided name for the run
  evalSpecId: varchar('eval_spec_id').notNull(),
  policyId: varchar('policy_id'), // optional - can be null for runs without specific policy
  // Agent tracking (from agent-evaluation merge)
  agentId: varchar('agent_id'), // References agents.id — nullable for prompt-only runs
  agentVersion: varchar('agent_version', { length: 50 }), // Snapshot of version at run time
  status: varchar('status').notNull(), // pending, running, completed, failed
  decision: varchar('decision'), // pass, warn, fail
  // Numeric policy-gate score (0-100, rounded percentage of passed rules).
  // Nullable: pre-existing rows have no value, and not every run has an
  // active policy evaluated against it.
  policyScore: integer('policy_score'),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  metrics: jsonb('metrics'),
  cost: real('cost'),
  duration: integer('duration'), // seconds
  errorMessage: text('error_message'),
  triggeredBy: varchar('triggered_by').notNull(),
  commitSha: varchar('commit_sha'),
  organizationId: varchar('organization_id').notNull(),
  description: text('description'), // optional description
  // Trace event stream captured during agent execution
  traceEvents: jsonb('trace_events'), // TraceEvent[] — nullable for non-agent runs
  // Migration tracking: timestamp when trace_events were migrated to trace_spans
  traceMigratedAt: timestamp('trace_migrated_at'), // nullable - set when migration completes
  // Artifact hashes for immutability verification
  artifactHashes: jsonb('artifact_hashes'), // Record<string, string>
  createdAt: timestamp('created_at').defaultNow(),
});

// Sample Results table - stores individual evaluation sample results
export const sampleResults = pgTable('sample_results', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runId: varchar('run_id').notNull(),
  sampleIndex: integer('sample_index').notNull(),
  repetition: integer('repetition').notNull(),
  input: jsonb('input').notNull(),
  expectedOutput: jsonb('expected_output'),
  actualOutput: jsonb('actual_output'),
  evaluationResults: jsonb('evaluation_results').notNull(), // { exactMatch: 1, cost: 0.001, latency: 1200 }
  organizationId: varchar('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations — cross-module relations (baselines, policyViolations, agent, simulationRun, etc.)
// are defined in schema/index.ts to avoid circular imports across bounded-context files.

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
}));

// Insert schemas — drizzle-zod createInsertSchema() returns a type that requires `as any`
// to call .omit() because drizzle-zod's internal ZodObject generic does not expose .omit()
// in all TypeScript configurations. Each cast is intentional — not a logic error.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertPromptSchema = (createInsertSchema(prompts) as any).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertFlowSchema = (createInsertSchema(flows) as any).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertDatasetSchema = (createInsertSchema(datasets) as any).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertDatasetSampleSchema = (
  createInsertSchema(datasetSamples) as any
).omit({
  id: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertEvalSpecSchema = (createInsertSchema(evalSpecs) as any).omit(
  {
    id: true,
    createdAt: true,
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertRunSchema = (createInsertSchema(runs) as any).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertSampleResultSchema = (
  createInsertSchema(sampleResults) as any
).omit({
  id: true,
  createdAt: true,
});

// Types
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

export type SampleResult = typeof sampleResults.$inferSelect;
export type InsertSampleResult = z.infer<typeof insertSampleResultSchema>;
