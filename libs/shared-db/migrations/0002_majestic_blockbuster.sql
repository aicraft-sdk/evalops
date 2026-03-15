ALTER TABLE "runs" ADD COLUMN "trace_migrated_at" timestamp;--> statement-breakpoint
ALTER TABLE "custom_evaluators" ADD COLUMN "execution_type" varchar DEFAULT 'sandbox';--> statement-breakpoint
ALTER TABLE "custom_evaluators" ADD COLUMN "sandbox_config" jsonb;--> statement-breakpoint
ALTER TABLE "custom_evaluators" ADD COLUMN "execution_timeout" integer DEFAULT 300;