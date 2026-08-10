-- Organization membership table for the self-service create-organization
-- flow: a user creating a NEW org becomes that org's ORG_ADMIN via a row
-- here, without touching their `users.organizationId`/`users.role` "home"
-- org fields.
CREATE TABLE "organization_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_unique" ON "organization_members" USING btree ("organization_id","user_id");
--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Unlike every other tenant-scoped table, an INSERT here legitimately
-- targets a DIFFERENT org than the request's current session org: a user
-- creating a new org has their RLS session pinned to their existing
-- (e.g. default-org) context, but the membership row being written is for
-- the brand new org they just created. A blanket USING-as-WITH-CHECK
-- policy (the pattern every other table uses) would reject that INSERT in
-- production. Instead: INSERT is allowed for a row granting membership to
-- YOURSELF (any org), matching exactly the self-service create-org flow;
-- SELECT is allowed for your current org's members OR your own rows in any
-- org; UPDATE/DELETE stay scoped to the current org context.
CREATE POLICY organization_members_select ON "organization_members"
  FOR SELECT
  USING (
    "organization_id" = current_setting('app.org_id', true)::text
    OR "user_id" = current_setting('app.user_id', true)::text
  );
--> statement-breakpoint
CREATE POLICY organization_members_insert ON "organization_members"
  FOR INSERT
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::text);
--> statement-breakpoint
CREATE POLICY organization_members_update ON "organization_members"
  FOR UPDATE
  USING ("organization_id" = current_setting('app.org_id', true)::text)
  WITH CHECK ("organization_id" = current_setting('app.org_id', true)::text);
--> statement-breakpoint
CREATE POLICY organization_members_delete ON "organization_members"
  FOR DELETE
  USING ("organization_id" = current_setting('app.org_id', true)::text);
