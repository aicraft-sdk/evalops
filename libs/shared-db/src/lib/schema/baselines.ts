import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users, organizations } from './core';
import { evalSpecs, runs } from './runs';

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

// Relations
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

// Insert schema — drizzle-zod cast is intentional (see runs.ts for explanation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertBaselineSchema = (createInsertSchema(baselines) as any).omit(
  {
    id: true,
    createdAt: true,
  }
);

// Types
export type Baseline = typeof baselines.$inferSelect;
export type InsertBaseline = z.infer<typeof insertBaselineSchema>;
