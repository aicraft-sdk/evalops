CREATE TABLE "judge_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" varchar NOT NULL,
	"evaluator_name" varchar NOT NULL,
	"sample_id" varchar,
	"score" real NOT NULL,
	"reasoning" text,
	"cost" numeric(10, 6) DEFAULT '0' NOT NULL,
	"model" varchar NOT NULL,
	"temperature" real,
	"seed" integer,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_judge_cache_key" ON "judge_cache" USING btree ("cache_key");
--> statement-breakpoint
CREATE INDEX "idx_judge_cache_org" ON "judge_cache" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "judge_cache" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "judge_cache"
  USING ("organization_id" = current_setting('app.org_id', true)::text);
