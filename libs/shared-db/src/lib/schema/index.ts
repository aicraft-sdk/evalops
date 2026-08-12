// Re-export all tables, types, and schemas from domain modules
export * from './core';
export * from './evaluation';
export * from './policies';
export * from './cicd';
export * from './ai-providers';
export * from './evaluators';
export * from './permissions';
export * from './azure';
export * from './agents';
export * from './integration';
export * from './judge-cache';

// Import all tables and set up cross-module relations
import { users, organizations } from './core';
import {
  prompts,
  flows,
  datasets,
  evalSpecs,
  runs,
  baselines,
  simulationSuites,
  simulationScenarios,
  simulationRuns,
  traceSpans,
  runAnnotations,
  reviewQueueItems,
} from './evaluation';
import { policies, policyViolations } from './policies';
import { agents } from './agents';
import { relations } from 'drizzle-orm';

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
  agents: many(agents),
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
  agents: many(agents),
  simulationSuites: many(simulationSuites),
  simulationScenarios: many(simulationScenarios),
  simulationRuns: many(simulationRuns),
  traceSpans: many(traceSpans),
  runAnnotations: many(runAnnotations),
  reviewQueueItems: many(reviewQueueItems),
}));

// Re-export runRelations with policyViolations, agent, and simulation relations added
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
  agent: one(agents, {
    fields: [runs.agentId],
    references: [agents.id],
  }),
  simulationRun: one(simulationRuns, {
    fields: [runs.id],
    references: [simulationRuns.runId],
  }),
  traceSpans: many(traceSpans),
  runAnnotations: many(runAnnotations),
  reviewQueueItems: many(reviewQueueItems),
}));

// Cross-module extension: evalSpecRelations with baselines (defined here to avoid circular import)
export const evalSpecCrossRelations = relations(evalSpecs, ({ many }) => ({
  baselines: many(baselines),
}));
