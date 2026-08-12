import { sql } from 'drizzle-orm';
import {
  pgTable, varchar, text, boolean, jsonb, real, integer, timestamp, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const goldenSets = pgTable('golden_sets', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  description: text('description'),
  organizationId: varchar('organization_id').notNull(),
  createdBy: varchar('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [index('idx_golden_sets_org').on(table.organizationId)]);

export const goldenSetExamples = pgTable('golden_set_examples', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  goldenSetId: varchar('golden_set_id').notNull().references(() => goldenSets.id),
  input: jsonb('input'),
  output: jsonb('output').notNull(),
  expected: jsonb('expected'),
  context: jsonb('context'),
  humanLabel: boolean('human_label').notNull(),
  humanReasoning: text('human_reasoning'),
  isBadExample: boolean('is_bad_example').notNull().default(false),
  createdBy: varchar('created_by').notNull(),
  organizationId: varchar('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_golden_set_examples_set').on(table.goldenSetId),
  index('idx_golden_set_examples_org').on(table.organizationId),
]);

export const calibrationRuns = pgTable('calibration_runs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  goldenSetId: varchar('golden_set_id').notNull().references(() => goldenSets.id),
  judgeEvaluator: varchar('judge_evaluator').notNull(),
  judgeConfig: jsonb('judge_config').notNull().default({}),
  judgeThreshold: real('judge_threshold').notNull().default(0.5),
  agreementRate: real('agreement_rate').notNull(),
  kappa: real('kappa'),
  isCalibrated: boolean('is_calibrated').notNull(),
  isReliable: boolean('is_reliable').notNull().default(true),
  sampleCount: integer('sample_count').notNull(),
  disagreements: jsonb('disagreements').notNull().default([]),
  organizationId: varchar('organization_id').notNull(),
  triggeredBy: varchar('triggered_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_calibration_runs_set').on(table.goldenSetId),
  index('idx_calibration_runs_org').on(table.organizationId),
]);

export const goldenSetRelations = relations(goldenSets, ({ many }) => ({
  examples: many(goldenSetExamples),
  calibrationRuns: many(calibrationRuns),
}));
export const goldenSetExampleRelations = relations(goldenSetExamples, ({ one }) => ({
  goldenSet: one(goldenSets, { fields: [goldenSetExamples.goldenSetId], references: [goldenSets.id] }),
}));
export const calibrationRunRelations = relations(calibrationRuns, ({ one }) => ({
  goldenSet: one(goldenSets, { fields: [calibrationRuns.goldenSetId], references: [goldenSets.id] }),
}));

export type GoldenSet = typeof goldenSets.$inferSelect;
export type GoldenSetExample = typeof goldenSetExamples.$inferSelect;
export type CalibrationRun = typeof calibrationRuns.$inferSelect;
