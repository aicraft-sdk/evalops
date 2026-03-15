import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, organizations } from "./core";
import { runs } from "./evaluation";

// Policies table
export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  rules: jsonb("rules").notNull(), // Array of policy rules
  isActive: boolean("is_active").notNull().default(true),
  organizationId: varchar("organization_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Policy Violations table
export const policyViolations = pgTable("policy_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  policyId: varchar("policy_id").notNull(),
  ruleIndex: integer("rule_index").notNull(),
  severity: varchar("severity").notNull(), // warn, fail
  message: text("message").notNull(),
  evidence: jsonb("evidence"),
  organizationId: varchar("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const policyRelations = relations(policies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policies.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [policies.createdBy],
    references: [users.id],
  }),
  violations: many(policyViolations),
}));

export const policyViolationRelations = relations(policyViolations, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyViolations.organizationId],
    references: [organizations.id],
  }),
  run: one(runs, {
    fields: [policyViolations.runId],
    references: [runs.id],
  }),
  policy: one(policies, {
    fields: [policyViolations.policyId],
    references: [policies.id],
  }),
}));

// Insert schemas - using 'as const' to fix type errors
export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
} as const);

export const insertPolicyViolationSchema = createInsertSchema(policyViolations).omit({
  id: true,
  createdAt: true,
} as const);

// Types
export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = z.infer<typeof insertPolicySchema>;

export type PolicyViolation = typeof policyViolations.$inferSelect;
export type InsertPolicyViolation = z.infer<typeof insertPolicyViolationSchema>;

