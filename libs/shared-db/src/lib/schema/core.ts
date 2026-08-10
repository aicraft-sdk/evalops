import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  index,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  'sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull(),
  },
  (table) => [index('IDX_session_expire').on(table.expire)]
);

// User storage table (required for Replit Auth)
export const users = pgTable('users', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar('email').unique(),
  passwordHash: text('password_hash'), // Nullable for Microsoft SSO users
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  profileImageUrl: varchar('profile_image_url'),
  role: varchar('role').notNull().default('viewer'), // admin, editor, viewer
  organizationId: varchar('organization_id').notNull(),
  // Microsoft Entra ID integration fields
  entraId: varchar('entra_id').unique(), // Microsoft Entra ID user object ID
  upn: varchar('upn'), // User Principal Name from Entra ID
  tenantId: varchar('tenant_id'), // Entra ID tenant identifier
  department: varchar('department'),
  jobTitle: varchar('job_title'),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User API Keys table (encrypted storage)
export const userApiKeys = pgTable('user_api_keys', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar('user_id').notNull(),
  provider: varchar('provider').notNull(), // 'openai', 'azure-openai', etc.
  encryptedKey: text('encrypted_key').notNull(), // Encrypted API key
  keyHash: varchar('key_hash').notNull(), // Hash for validation
  displayName: varchar('display_name'), // User-friendly name
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Organizations table
export const organizations = pgTable('organizations', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Organization membership table — tracks a user's role in an organization
// that is NOT their `users.organizationId` "home" org. Used by the
// self-service create-organization flow: creating a new org does not touch
// the creator's home-org row (`users.organizationId`/`users.role`), it only
// adds a row here scoping their ORG_ADMIN role to the new org specifically.
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: varchar('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: varchar('organization_id').notNull(),
    userId: varchar('user_id').notNull(),
    role: varchar('role').notNull().default('member'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_members_org_user_unique').on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;

// Audit Trail table
export const auditTrail = pgTable('audit_trail', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entityType: varchar('entity_type').notNull(),
  entityId: varchar('entity_id').notNull(),
  action: varchar('action').notNull(), // create, update, delete
  changes: jsonb('changes'),
  userId: varchar('user_id').notNull(),
  organizationId: varchar('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Personal access tokens for CLI and API key auth
export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: varchar('organization_id').notNull(),
  userId: varchar('user_id').notNull(),
  name: varchar('name').notNull(),
  tokenHash: varchar('token_hash').notNull().unique(),
  scopes: text('scopes').array().notNull().default(sql`ARRAY[]::text[]`),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type PersonalAccessToken = typeof personalAccessTokens.$inferSelect;

// Relations - these will be properly set up in index.ts after all modules are imported

export const auditTrailRelations = relations(auditTrail, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditTrail.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditTrail.userId],
    references: [users.id],
  }),
}));

// Insert schemas - using type assertion to fix type errors
export const insertUserSchema = (createInsertSchema(users) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrganizationSchema = (
  createInsertSchema(organizations) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditTrailSchema = (
  createInsertSchema(auditTrail) as any
).omit({
  id: true,
  createdAt: true,
});

export const insertUserApiKeySchema = (
  createInsertSchema(userApiKeys) as any
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type AuditTrail = typeof auditTrail.$inferSelect;
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;

// Enhanced audit entry with resolved user and entity information
export type EnhancedAuditEntry = AuditTrail & {
  userName: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  entityName: string;
  description: string;
};

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
