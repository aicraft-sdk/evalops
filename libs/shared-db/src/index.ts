// Export all database schema definitions
export * from './lib/schema';
export * from './lib/db';
export * from './lib/dialect-utils';

// SQLite schema for dev mode — only import when EVALOPS_DEV_MODE=1
export * as sqliteSchema from './lib/schema/sqlite-index';

// Repository layer
export * from './lib/repositories/users.repository';
export * from './lib/repositories/organizations.repository';
export * from './lib/repositories/permissions.repository';
export * from './lib/repositories/flows.repository';
export * from './lib/repositories/prompts.repository';
export * from './lib/repositories/datasets.repository';
export * from './lib/repositories/eval-specs.repository';
export * from './lib/repositories/providers.repository';
export * from './lib/repositories/models.repository';
export * from './lib/repositories/agents.repository';
export * from './lib/repositories/runs.repository';
export * from './lib/repositories/sample-results.repository';
export * from './lib/repositories/review-queue.repository';
export * from './lib/repositories/custom-evaluators.repository';
export * from './lib/repositories/cicd.repository';
export * from './lib/repositories/alerts.repository';
export * from './lib/repositories/audit.repository';
export * from './lib/repositories/metrics.repository';
export * from './lib/repositories/personal-access-tokens.repository';
export * from './lib/repositories/judge-cache.repository';
export * from './lib/repositories/golden-sets.repository';
export * from './lib/shared-db.module';

