import { sql } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Sandbox audit log table
 * Stores comprehensive audit logs for all sandbox operations
 */
export const sandboxAuditLog = pgTable(
  'sandbox_audit_log',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sandboxId: varchar('sandbox_id').notNull(),
    operation: varchar('operation').notNull(), // create, execute, delete, security_violation
    userId: varchar('user_id').notNull(),
    organizationId: varchar('organization_id').notNull(),
    resourceUsage: jsonb('resource_usage'), // { cpu, memory, executionTime }
    securityViolations: jsonb('security_violations'), // string[]
    codeHash: varchar('code_hash'), // SHA-256 hash
    requestId: varchar('request_id'), // Correlation ID from x-request-id header
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_sandbox_audit_sandbox_id').on(table.sandboxId),
    index('idx_sandbox_audit_org_id').on(table.organizationId),
    index('idx_sandbox_audit_created_at').on(table.createdAt),
    index('idx_sandbox_audit_code_hash').on(table.codeHash),
  ],
);

/**
 * Insert schema for sandbox audit log
 */
export const insertSandboxAuditLogSchema = createInsertSchema(sandboxAuditLog, {
  operation: z.enum(['create', 'execute', 'delete', 'security_violation']),
}).extend({
  resourceUsage: z
    .object({
      cpu: z.number().optional(),
      memory: z.number().optional(),
      executionTime: z.number().optional(),
    })
    .optional(),
  securityViolations: z.array(z.string()).optional(),
});

export type InsertSandboxAuditLog = z.infer<
  typeof insertSandboxAuditLogSchema
>;
