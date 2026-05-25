/**
 * SQLite equivalents of core.ts Postgres tables.
 * Used when EVALOPS_DEV_MODE=1.
 *
 * Type mapping applied:
 *  - pgTable → sqliteTable
 *  - varchar/text → text
 *  - boolean → integer (mode: 'boolean')
 *  - timestamp → text (ISO string storage)
 *  - jsonb → text (mode: 'json')
 *  - gen_random_uuid() → $defaultFn(() => randomUUID())
 *  - .defaultNow() → $defaultFn(() => new Date().toISOString())
 *  - text().array().notNull().default(ARRAY[]::text[]) → text (mode: 'json') with $defaultFn
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'crypto';

// Session storage table
export const sessions = sqliteTable(
  'sessions',
  {
    sid: text('sid').primaryKey(),
    sess: text('sess', { mode: 'json' }).notNull(),
    expire: text('expire').notNull(),
  },
  (table) => [index('IDX_session_expire_sqlite').on(table.expire)],
);

// User storage table
export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  profileImageUrl: text('profile_image_url'),
  role: text('role').notNull().default('viewer'),
  organizationId: text('organization_id').notNull(),
  entraId: text('entra_id').unique(),
  upn: text('upn'),
  tenantId: text('tenant_id'),
  department: text('department'),
  jobTitle: text('job_title'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// User API Keys table
export const userApiKeys = sqliteTable('user_api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  keyHash: text('key_hash').notNull(),
  displayName: text('display_name'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Organizations table
export const organizations = sqliteTable('organizations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  slug: text('slug'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// Audit Trail table
export const auditTrail = sqliteTable('audit_trail', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  changes: text('changes', { mode: 'json' }),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// Personal access tokens for CLI and API key auth
export const personalAccessTokens = sqliteTable('personal_access_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text('organization_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  // Postgres text[].array() → JSON text array stored as JSON string
  scopes: text('scopes', { mode: 'json' })
    .notNull()
    .$defaultFn(() => JSON.stringify([])),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});
