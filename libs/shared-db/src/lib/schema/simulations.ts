import { sql } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  integer,
  jsonb,
  text,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users, organizations } from './core';
import { runs } from './runs';

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

// Relations
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

// Insert schemas — drizzle-zod cast is intentional (see runs.ts for explanation)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertSimulationSuiteSchema = (
  createInsertSchema(simulationSuites) as any
).omit({
  id: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertSimulationScenarioSchema = (
  createInsertSchema(simulationScenarios) as any
).omit({
  id: true,
  createdAt: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const insertSimulationRunSchema = (
  createInsertSchema(simulationRuns) as any
).omit({
  id: true,
  createdAt: true,
});

// Types
export type SimulationSuite = typeof simulationSuites.$inferSelect;
export type InsertSimulationSuite = z.infer<typeof insertSimulationSuiteSchema>;

export type SimulationScenario = typeof simulationScenarios.$inferSelect;
export type InsertSimulationScenario = z.infer<
  typeof insertSimulationScenarioSchema
>;

export type SimulationRun = typeof simulationRuns.$inferSelect;
export type InsertSimulationRun = z.infer<typeof insertSimulationRunSchema>;
