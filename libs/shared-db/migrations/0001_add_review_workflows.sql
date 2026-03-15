CREATE TABLE "review_queue_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"annotation_id" varchar,
	"source_type" varchar NOT NULL,
	"source_id" varchar,
	"status" varchar DEFAULT 'open' NOT NULL,
	"priority" varchar DEFAULT 'medium' NOT NULL,
	"assignee_id" varchar,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"promoted_to_dataset_id" varchar,
	"promoted_to_scenario_id" varchar,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "run_annotations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"span_id" varchar,
	"label" varchar NOT NULL,
	"severity" varchar NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"link_targets" jsonb DEFAULT '[]'::jsonb,
	"author_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_annotation_id_run_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."run_annotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_promoted_to_dataset_id_datasets_id_fk" FOREIGN KEY ("promoted_to_dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_promoted_to_scenario_id_simulation_scenarios_id_fk" FOREIGN KEY ("promoted_to_scenario_id") REFERENCES "public"."simulation_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_annotations" ADD CONSTRAINT "run_annotations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_annotations" ADD CONSTRAINT "run_annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_review_queue_run_id" ON "review_queue_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_review_queue_status" ON "review_queue_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_review_queue_priority" ON "review_queue_items" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_review_queue_assignee" ON "review_queue_items" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_review_queue_source_type" ON "review_queue_items" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_run_id" ON "run_annotations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_span_id" ON "run_annotations" USING btree ("span_id");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_label" ON "run_annotations" USING btree ("label");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_severity" ON "run_annotations" USING btree ("severity");