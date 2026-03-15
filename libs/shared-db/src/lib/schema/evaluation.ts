import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  real,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users, organizations } from './core';
import { policies } from './policies';

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

// Baselines table
export const baselines = pgTable('baselines', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  evalSpecId: varchar('eval_spec_id').notNull(),
  runId: varchar('run_id').notNull(),
  name: varchar('name').notNull(),
  description: text('description'),
  metrics: jsonb('metrics').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
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

// Simulation Suites table - versioned collection of scenarios
export const simulationSuites = pgTable('simulation_suites', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  version: varchar('version').notNull(), // semantic version
  description: text('description'),
  config: jsonb('config').default({}), // timeout, retry policies, default judge settings
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Simulation Scenarios table - multi-turn conversation definitions
export const simulationScenarios = pgTable('simulation_scenarios', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  suiteId: varchar('suite_id')
    .notNull()
    .references(() => simulationSuites.id),
  name: varchar('name').notNull(),
  order: integer('order').notNull(), // ordering within suite
  definition: jsonb('definition').notNull(), // turn definitions, assertions, termination rules
  organizationId: varchar('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Simulation Runs table - links simulation execution to runs table
export const simulationRuns = pgTable('simulation_runs', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  runId: varchar('run_id')
    .notNull()
    .unique()
    .references(() => runs.id),
  suiteId: varchar('suite_id')
    .notNull()
    .references(() => simulationSuites.id),
  scenarioId: varchar('scenario_id')
    .notNull()
    .references(() => simulationScenarios.id),
  organizationId: varchar('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Trace Spans table - OTLP-shaped span storage
export const traceSpans = pgTable(
  'trace_spans',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    traceId: varchar('trace_id').notNull(), // OpenTelemetry trace ID
    spanId: varchar('span_id').notNull(), // OpenTelemetry span ID
    parentSpanId: varchar('parent_span_id'), // Parent span ID (nullable for root spans)
    name: varchar('name').notNull(), // Span name (e.g., "simulation.run", "simulation.turn", "llm.call")
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'), // nullable for in-progress spans
    attributes: jsonb('attributes').default({}), // OTLP attributes (key-value pairs)
    events: jsonb('events').default([]), // OTLP events array
    runId: varchar('run_id')
      .notNull()
      .references(() => runs.id),
    organizationId: varchar('organization_id').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_trace_spans_trace_id').on(table.traceId),
    index('idx_trace_spans_span_id').on(table.spanId),
    index('idx_trace_spans_parent_span_id').on(table.parentSpanId),
    index('idx_trace_spans_run_id').on(table.runId),
    index('idx_trace_spans_organization_id').on(table.organizationId),
  ]
);

// Run Annotations table
export const runAnnotations = pgTable(
  'run_annotations',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar('run_id')
      .notNull()
      .references(() => runs.id),
    spanId: varchar('span_id'), // nullable - can annotate entire run or specific span
    label: varchar('label').notNull(), // e.g., "bug", "false_positive", "regression", "improvement"
    severity: varchar('severity').notNull(), // "low", "medium", "high", "critical"
    notes: text('notes'), // free-form notes
    tags: jsonb('tags').default([]), // array of string tags
    linkTargets: jsonb('link_targets').default([]), // array of {type, id} links to related runs/spans
    authorId: varchar('author_id')
      .notNull()
      .references(() => users.id),
    organizationId: varchar('organization_id').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_run_annotations_run_id').on(table.runId),
    index('idx_run_annotations_span_id').on(table.spanId),
    index('idx_run_annotations_label').on(table.label),
    index('idx_run_annotations_severity').on(table.severity),
  ]
);

// Review Queue Items table
export const reviewQueueItems = pgTable(
  'review_queue_items',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar('run_id')
      .notNull()
      .references(() => runs.id),
    annotationId: varchar('annotation_id').references(() => runAnnotations.id), // nullable - can be auto-created from policy violation
    sourceType: varchar('source_type').notNull(), // "policy_violation", "evaluator_failure", "annotation", "regression"
    sourceId: varchar('source_id'), // ID of the source (policy_violation.id, etc.)
    status: varchar('status').notNull().default('open'), // "open", "triaged", "fixed", "dismissed", "promoted"
    priority: varchar('priority').notNull().default('medium'), // "low", "medium", "high", "urgent"
    assigneeId: varchar('assignee_id').references(() => users.id), // nullable
    tags: jsonb('tags').default([]), // array of string tags for filtering
    notes: text('notes'), // triage notes
    promotedToDatasetId: varchar('promoted_to_dataset_id').references(
      () => datasets.id
    ), // nullable
    promotedToScenarioId: varchar('promoted_to_scenario_id').references(
      () => simulationScenarios.id
    ), // nullable
    organizationId: varchar('organization_id').notNull(),
    createdBy: varchar('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    resolvedAt: timestamp('resolved_at'), // nullable
  },
  (table) => [
    index('idx_review_queue_run_id').on(table.runId),
    index('idx_review_queue_status').on(table.status),
    index('idx_review_queue_priority').on(table.priority),
    index('idx_review_queue_assignee').on(table.assigneeId),
    index('idx_review_queue_source_type').on(table.sourceType),
  ]
);

// Relations
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

// runRelations will be set up in index.ts to include policyViolations

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

export const simulationSuiteRelations = relations(
  simulationSuites,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [simulationSuites.organizationId],
      references: [organizations.id],
    }),
    createdByUser: one(users, {
      fields: [simulationSuites.createdBy],
      references: [users.id],
    }),
    scenarios: many(simulationScenarios),
    simulationRuns: many(simulationRuns),
  })
);

export const simulationScenarioRelations = relations(
  simulationScenarios,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [simulationScenarios.organizationId],
      references: [organizations.id],
    }),
    suite: one(simulationSuites, {
      fields: [simulationScenarios.suiteId],
      references: [simulationSuites.id],
    }),
    simulationRuns: many(simulationRuns),
  })
);

export const simulationRunRelations = relations(simulationRuns, ({ one }) => ({
  organization: one(organizations, {
    fields: [simulationRuns.organizationId],
    references: [organizations.id],
  }),
  run: one(runs, {
    fields: [simulationRuns.runId],
    references: [runs.id],
  }),
  suite: one(simulationSuites, {
    fields: [simulationRuns.suiteId],
    references: [simulationSuites.id],
  }),
  scenario: one(simulationScenarios, {
    fields: [simulationRuns.scenarioId],
    references: [simulationScenarios.id],
  }),
}));

export const traceSpanRelations = relations(traceSpans, ({ one }) => ({
  organization: one(organizations, {
    fields: [traceSpans.organizationId],
    references: [organizations.id],
  }),
  run: one(runs, {
    fields: [traceSpans.runId],
    references: [runs.id],
  }),
}));

export const runAnnotationRelations = relations(runAnnotations, ({ one }) => ({
  organization: one(organizations, {
    fields: [runAnnotations.organizationId],
    references: [organizations.id],
  }),
  run: one(runs, {
    fields: [runAnnotations.runId],
    references: [runs.id],
  }),
  author: one(users, {
    fields: [runAnnotations.authorId],
    references: [users.id],
  }),
}));

export const reviewQueueItemRelations = relations(
  reviewQueueItems,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [reviewQueueItems.organizationId],
      references: [organizations.id],
    }),
    run: one(runs, {
      fields: [reviewQueueItems.runId],
      references: [runs.id],
    }),
    annotation: one(runAnnotations, {
      fields: [reviewQueueItems.annotationId],
      references: [runAnnotations.id],
    }),
    assignee: one(users, {
      fields: [reviewQueueItems.assigneeId],
      references: [users.id],
    }),
    createdByUser: one(users, {
      fields: [reviewQueueItems.createdBy],
      references: [users.id],
    }),
    promotedToDataset: one(datasets, {
      fields: [reviewQueueItems.promotedToDatasetId],
      references: [datasets.id],
    }),
    promotedToScenario: one(simulationScenarios, {
      fields: [reviewQueueItems.promotedToScenarioId],
      references: [simulationScenarios.id],
    }),
  })
);

// Insert schemas - using type assertion to fix type errors
export const insertPromptSchema = (createInsertSchema(prompts) as any).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

export const insertFlowSchema = (createInsertSchema(flows) as any).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

export const insertDatasetSchema = (createInsertSchema(datasets) as any).omit({
  id: true,
  contentHash: true,
  createdAt: true,
});

export const insertDatasetSampleSchema = (
  createInsertSchema(datasetSamples) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertEvalSpecSchema = (createInsertSchema(evalSpecs) as any).omit(
  {
    id: true,
    createdAt: true,
  }
);

export const insertRunSchema = (createInsertSchema(runs) as any).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

export const insertBaselineSchema = (createInsertSchema(baselines) as any).omit(
  {
    id: true,
    createdAt: true,
  }
);

export const insertSampleResultSchema = (
  createInsertSchema(sampleResults) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertSimulationSuiteSchema = (
  createInsertSchema(simulationSuites) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertSimulationScenarioSchema = (
  createInsertSchema(simulationScenarios) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertSimulationRunSchema = (
  createInsertSchema(simulationRuns) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertTraceSpanSchema = (
  createInsertSchema(traceSpans) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertRunAnnotationSchema = (
  createInsertSchema(runAnnotations) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReviewQueueItemSchema = (
  createInsertSchema(reviewQueueItems) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export type Baseline = typeof baselines.$inferSelect;
export type InsertBaseline = z.infer<typeof insertBaselineSchema>;

export type SampleResult = typeof sampleResults.$inferSelect;
export type InsertSampleResult = z.infer<typeof insertSampleResultSchema>;

export type SimulationSuite = typeof simulationSuites.$inferSelect;
export type InsertSimulationSuite = z.infer<typeof insertSimulationSuiteSchema>;

export type SimulationScenario = typeof simulationScenarios.$inferSelect;
export type InsertSimulationScenario = z.infer<
  typeof insertSimulationScenarioSchema
>;

export type SimulationRun = typeof simulationRuns.$inferSelect;
export type InsertSimulationRun = z.infer<typeof insertSimulationRunSchema>;

export type TraceSpan = typeof traceSpans.$inferSelect;
export type InsertTraceSpan = z.infer<typeof insertTraceSpanSchema>;

export type RunAnnotation = typeof runAnnotations.$inferSelect;
export type InsertRunAnnotation = z.infer<typeof insertRunAnnotationSchema>;

export type ReviewQueueItem = typeof reviewQueueItems.$inferSelect;
export type InsertReviewQueueItem = z.infer<typeof insertReviewQueueItemSchema>;
