// Re-export all tables, types, and schemas from domain modules
export * from "./core";
export * from "./evaluation";
export * from "./policies";
export * from "./cicd";
export * from "./ai-providers";
export * from "./evaluators";
export * from "./permissions";
export * from "./azure";

// Import all tables and set up cross-module relations
import { users, organizations } from "./core";
import { prompts, flows, datasets, evalSpecs, runs, baselines } from "./evaluation";
import { policies, policyViolations } from "./policies";
import { relations } from "drizzle-orm";

// Set up relations that cross module boundaries
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

// Re-export runRelations with policyViolations added
import { runRelations as baseRunRelations } from "./evaluation";
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

