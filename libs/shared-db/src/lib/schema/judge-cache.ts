import { sql } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  real,
  integer,
  decimal,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// Deterministic judge-scoring cache: one row per unique
// (evaluator, organization, sample, output, prompt/config, seed) combination.
// See JudgeCacheService for cache-key derivation — cacheKey already encodes
// organizationId, so a global unique index on cacheKey alone is sufficient;
// organizationId is still stored as its own column for RLS + query filtering.
export const judgeCache = pgTable(
  'judge_cache',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    cacheKey: varchar('cache_key').notNull(),
    evaluatorName: varchar('evaluator_name').notNull(),
    sampleId: varchar('sample_id'),
    score: real('score').notNull(),
    reasoning: text('reasoning'),
    cost: decimal('cost', { precision: 10, scale: 6 }).notNull().default('0'),
    model: varchar('model').notNull(),
    temperature: real('temperature'),
    seed: integer('seed'),
    organizationId: varchar('organization_id').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_judge_cache_key').on(table.cacheKey),
    index('idx_judge_cache_org').on(table.organizationId),
  ],
);

export type JudgeCacheEntry = typeof judgeCache.$inferSelect;
