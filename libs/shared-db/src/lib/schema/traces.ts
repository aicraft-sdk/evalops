import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users, organizations } from './core';
import { runs, datasets } from './runs';
import { simulationScenarios } from './simulations';

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

// Insert schemas — drizzle-zod cast is intentional (see runs.ts for explanation)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertTraceSpanSchema = (
  createInsertSchema(traceSpans) as any
).omit({
  id: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertRunAnnotationSchema = (
  createInsertSchema(runAnnotations) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertReviewQueueItemSchema = (
  createInsertSchema(reviewQueueItems) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type TraceSpan = typeof traceSpans.$inferSelect;
export type InsertTraceSpan = z.infer<typeof insertTraceSpanSchema>;

export type RunAnnotation = typeof runAnnotations.$inferSelect;
export type InsertRunAnnotation = z.infer<typeof insertRunAnnotationSchema>;

export type ReviewQueueItem = typeof reviewQueueItems.$inferSelect;
export type InsertReviewQueueItem = z.infer<typeof insertReviewQueueItemSchema>;
