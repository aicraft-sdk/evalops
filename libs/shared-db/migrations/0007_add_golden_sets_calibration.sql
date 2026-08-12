CREATE TABLE "golden_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "golden_set_examples" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"golden_set_id" varchar NOT NULL,
	"input" jsonb,
	"output" jsonb NOT NULL,
	"expected" jsonb,
	"context" jsonb,
	"human_label" boolean NOT NULL,
	"human_reasoning" text,
	"is_bad_example" boolean DEFAULT false NOT NULL,
	"created_by" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "calibration_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"golden_set_id" varchar NOT NULL,
	"judge_evaluator" varchar NOT NULL,
	"judge_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"judge_threshold" real DEFAULT 0.5 NOT NULL,
	"agreement_rate" real NOT NULL,
	"kappa" real,
	"is_calibrated" boolean NOT NULL,
	"is_reliable" boolean DEFAULT true NOT NULL,
	"sample_count" integer NOT NULL,
	"disagreements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organization_id" varchar NOT NULL,
	"triggered_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "golden_set_examples" ADD CONSTRAINT "golden_set_examples_golden_set_id_golden_sets_id_fk" FOREIGN KEY ("golden_set_id") REFERENCES "public"."golden_sets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_golden_set_id_golden_sets_id_fk" FOREIGN KEY ("golden_set_id") REFERENCES "public"."golden_sets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_golden_sets_org" ON "golden_sets" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_golden_set_examples_set" ON "golden_set_examples" USING btree ("golden_set_id");
--> statement-breakpoint
CREATE INDEX "idx_golden_set_examples_org" ON "golden_set_examples" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_calibration_runs_set" ON "calibration_runs" USING btree ("golden_set_id");
--> statement-breakpoint
CREATE INDEX "idx_calibration_runs_org" ON "calibration_runs" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "golden_sets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "golden_sets"
  USING ("organization_id" = current_setting('app.org_id', true)::text);
--> statement-breakpoint
ALTER TABLE "golden_set_examples" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "golden_set_examples"
  USING ("organization_id" = current_setting('app.org_id', true)::text);
--> statement-breakpoint
ALTER TABLE "calibration_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "calibration_runs"
  USING ("organization_id" = current_setting('app.org_id', true)::text);
