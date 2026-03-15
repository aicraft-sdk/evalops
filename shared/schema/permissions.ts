import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./core";

// Resource types enum for granular permissions
export const resourceTypeEnum = pgEnum("resource_type", [
  "organization", "dataset", "prompt", "flow", "eval_spec", "run", "model", "provider", "policy", "baseline"
]);

// Permission actions enum
export const permissionActionEnum = pgEnum("permission_action", [
  "read", "write", "delete", "execute", "manage", "admin"
]);

// Roles table - defines organizational roles with hierarchies
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Admin", "Data Scientist", "ML Engineer", etc.
  description: text("description"),
  organizationId: varchar("organization_id").notNull(),
  isSystemRole: boolean("is_system_role").default(false), // Built-in roles vs custom roles
  priority: integer("priority").default(0), // Higher priority roles override lower ones
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [index("idx_roles_org").on(table.organizationId)]);

// User role assignments - many-to-many relationship
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  index("idx_user_roles_user").on(table.userId),
  index("idx_user_roles_role").on(table.roleId)
]);

// Permissions table - defines specific permission capabilities
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "datasets.read", "eval_specs.execute", etc.
  resourceType: resourceTypeEnum("resource_type").notNull(),
  action: permissionActionEnum("action").notNull(),
  description: text("description"),
  isSystemPermission: boolean("is_system_permission").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_permissions_resource_action").on(table.resourceType, table.action)
]);

// Role permissions - what permissions each role has
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => roles.id),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_role_permissions_role").on(table.roleId),
  index("idx_role_permissions_permission").on(table.permissionId)
]);

// Resource permissions - fine-grained permissions on specific resources
export const resourcePermissions = pgTable("resource_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  roleId: varchar("role_id").references(() => roles.id), 
  resourceType: resourceTypeEnum("resource_type").notNull(),
  resourceId: varchar("resource_id").notNull(), // ID of the specific resource
  action: permissionActionEnum("action").notNull(),
  granted: boolean("granted").notNull().default(true), // true = grant, false = deny
  grantedBy: varchar("granted_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_resource_permissions_user").on(table.userId),
  index("idx_resource_permissions_resource").on(table.resourceType, table.resourceId),
  index("idx_resource_permissions_role").on(table.roleId)
]);

// Audit log for permission changes
export const permissionAuditLog = pgTable("permission_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: varchar("action").notNull(), // "grant", "revoke", "role_assigned", etc.
  userId: varchar("user_id").references(() => users.id),
  targetUserId: varchar("target_user_id").references(() => users.id),
  resourceType: resourceTypeEnum("resource_type"),
  resourceId: varchar("resource_id"),
  permission: permissionActionEnum("permission"),
  roleId: varchar("role_id").references(() => roles.id),
  details: jsonb("details").default({}),
  performedBy: varchar("performed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_permission_audit_user").on(table.userId),
  index("idx_permission_audit_date").on(table.createdAt)
]);

// Insert schemas
export const insertRoleSchema = createInsertSchema(roles);
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type Role = typeof roles.$inferSelect;

export type UserRole = typeof userRoles.$inferSelect;
export const insertUserRoleSchema = createInsertSchema(userRoles);
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;

export type Permission = typeof permissions.$inferSelect;
export const insertPermissionSchema = createInsertSchema(permissions);
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

export type RolePermission = typeof rolePermissions.$inferSelect;
export const insertRolePermissionSchema = createInsertSchema(rolePermissions);
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;

export type ResourcePermission = typeof resourcePermissions.$inferSelect;
export const insertResourcePermissionSchema = createInsertSchema(resourcePermissions);
export type InsertResourcePermission = z.infer<typeof insertResourcePermissionSchema>;

export type PermissionAuditLog = typeof permissionAuditLog.$inferSelect;
export const insertPermissionAuditLogSchema = createInsertSchema(permissionAuditLog);
export type InsertPermissionAuditLog = z.infer<typeof insertPermissionAuditLogSchema>;

