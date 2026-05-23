import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  decimal,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { runs } from './evaluation';

// Evaluator status enum
export const evaluatorStatusEnum = pgEnum('evaluator_status', [
  'active',
  'disabled',
  'pending_validation',
  'validation_failed',
]);

// Custom evaluators table - user-uploaded evaluators
export const customEvaluators = pgTable(
  'custom_evaluators',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name').notNull(),
    description: text('description'),
    version: varchar('version').notNull().default('1.0.0'),

    // Evaluator metadata
    evaluatorType: varchar('evaluator_type').notNull(), // "similarity", "classification", "grading", etc.
    inputSchema: jsonb('input_schema'), // JSON schema for inputs
    outputSchema: jsonb('output_schema'), // JSON schema for outputs

    // File storage
    fileName: varchar('file_name').notNull(),
    fileHash: varchar('file_hash').notNull(), // SHA-256 hash for integrity
    fileSize: integer('file_size').notNull(),
    filePath: varchar('file_path').notNull(), // Object storage path

    // Status and validation
    status: evaluatorStatusEnum('status')
      .notNull()
      .default('pending_validation'),
    validationResults: jsonb('validation_results'), // Validation test results
    validationError: text('validation_error'),

    // Metadata
    tags: jsonb('tags').default([]), // Array of tags for categorization
    usage: jsonb('usage').default({}), // Usage statistics

    // Execution configuration
    executionType: varchar('execution_type').default('sandbox'), // "sandbox" | "inline" | "external"
    sandboxConfig: jsonb('sandbox_config'), // JSONB field for sandbox-specific settings (CPU, memory, timeout, network policy)
    executionTimeout: integer('execution_timeout').default(300), // Timeout in seconds

    // Ownership and audit
    organizationId: varchar('organization_id').notNull(),
    createdBy: varchar('created_by').notNull(),
    isPublic: boolean('is_public').default(false), // Can be shared across orgs

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_custom_evaluators_org').on(table.organizationId),
    index('idx_custom_evaluators_status').on(table.status),
    index('idx_custom_evaluators_type').on(table.evaluatorType),
    index('idx_custom_evaluators_hash').on(table.fileHash),
  ]
);

// Evaluator versions table - version history
export const evaluatorVersions = pgTable(
  'evaluator_versions',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    evaluatorId: varchar('evaluator_id')
      .notNull()
      .references(() => customEvaluators.id),
    version: varchar('version').notNull(),
    fileName: varchar('file_name').notNull(),
    fileHash: varchar('file_hash').notNull(),
    filePath: varchar('file_path').notNull(),

    // Change tracking
    changeLog: text('change_log'),
    previousVersionId: varchar('previous_version_id'),

    // Status
    status: evaluatorStatusEnum('status')
      .notNull()
      .default('pending_validation'),
    validationResults: jsonb('validation_results'),

    createdBy: varchar('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_evaluator_versions_evaluator').on(table.evaluatorId),
    index('idx_evaluator_versions_version').on(
      table.evaluatorId,
      table.version
    ),
  ]
);

// Evaluator usage tracking
export const evaluatorUsage = pgTable(
  'evaluator_usage',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    evaluatorId: varchar('evaluator_id')
      .notNull()
      .references(() => customEvaluators.id),
    runId: varchar('run_id').references(() => runs.id),

    // Usage metrics
    executionTime: integer('execution_time'), // milliseconds
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cost: decimal('cost', { precision: 10, scale: 4 }),

    // Result metrics
    success: boolean('success').notNull(),
    errorMessage: text('error_message'),

    organizationId: varchar('organization_id').notNull(),
    usedBy: varchar('used_by').notNull(),
    usedAt: timestamp('used_at').defaultNow(),
  },
  (table) => [
    index('idx_evaluator_usage_evaluator').on(table.evaluatorId),
    index('idx_evaluator_usage_run').on(table.runId),
    index('idx_evaluator_usage_org_date').on(
      table.organizationId,
      table.usedAt
    ),
  ]
);

// Insert schemas - using 'as const' to fix type errors
export const insertCustomEvaluatorSchema = (
  createInsertSchema(customEvaluators) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as { id: true; createdAt: true; updatedAt: true });
export type InsertCustomEvaluator = z.infer<typeof insertCustomEvaluatorSchema>;

export type CustomEvaluator = typeof customEvaluators.$inferSelect;

export type EvaluatorVersion = typeof evaluatorVersions.$inferSelect;
export const insertEvaluatorVersionSchema = createInsertSchema(evaluatorVersions);
export type InsertEvaluatorVersion = z.infer<
  typeof insertEvaluatorVersionSchema
>;

export type EvaluatorUsage = typeof evaluatorUsage.$inferSelect;
export const insertEvaluatorUsageSchema = (
  createInsertSchema(evaluatorUsage) as any
).omit({
  id: true,
});
export type InsertEvaluatorUsage = z.infer<typeof insertEvaluatorUsageSchema>;
