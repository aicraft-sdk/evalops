import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organizations, users } from './core';
import { runs } from './evaluation';

// Agents table — canonical agent definitions (AgentMD-compatible)
export const agents = pgTable(
  'agents',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: varchar('organization_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    // Current version fields — latest promoted version
    version: varchar('version', { length: 50 }).notNull(),
    versionHash: varchar('version_hash', { length: 64 }).notNull(),
    content: text('content').notNull(), // Raw AgentMD content
    // Parsed model config extracted from AgentMD
    modelProvider: varchar('model_provider', { length: 100 }),
    modelName: varchar('model_name', { length: 200 }),
    // Tags for search/filtering
    tags: jsonb('tags').default([]),
    metadata: jsonb('metadata').default({}),
    active: boolean('active').notNull().default(true),
    createdBy: varchar('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => ({
    orgNameIdx: index('agents_org_name_idx').on(t.organizationId, t.name),
    orgActiveIdx: index('agents_org_active_idx').on(t.organizationId, t.active),
  }),
);

// AgentVersions table — immutable version history
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: varchar('agent_id')
      .notNull()
      .references(() => agents.id),
    organizationId: varchar('organization_id').notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    versionHash: varchar('version_hash', { length: 64 }).notNull(),
    content: text('content').notNull(),
    changeNotes: text('change_notes'),
    metadata: jsonb('metadata').default({}),
    createdBy: varchar('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    agentVersionIdx: uniqueIndex('agent_versions_unique_idx').on(
      t.agentId,
      t.version,
    ),
    agentHashIdx: uniqueIndex('agent_versions_hash_idx').on(
      t.agentId,
      t.versionHash,
    ),
  }),
);

// Relations
export const agentRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [agents.createdBy],
    references: [users.id],
  }),
  versions: many(agentVersions),
  runs: many(runs),
}));

export const agentVersionRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
  organization: one(organizations, {
    fields: [agentVersions.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [agentVersions.createdBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertAgentSchema = (createInsertSchema(agents) as any).omit({
  id: true,
  versionHash: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentVersionSchema = (
  createInsertSchema(agentVersions) as any
).omit({
  id: true,
  createdAt: true,
});

// Types
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;

export type AgentVersion = typeof agentVersions.$inferSelect;
export type InsertAgentVersion = z.infer<typeof insertAgentVersionSchema>;
