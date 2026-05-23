CREATE TYPE "public"."alert_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."cicd_integration_type" AS ENUM('github', 'gitlab', 'bitbucket', 'azure_devops', 'jenkins', 'circleci');--> statement-breakpoint
CREATE TYPE "public"."cicd_run_status" AS ENUM('pending', 'running', 'success', 'failure', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_type" AS ENUM('openai', 'anthropic', 'azure_openai', 'google', 'google_gemini', 'xai', 'custom');--> statement-breakpoint
CREATE TYPE "public"."model_capability" AS ENUM('text_generation', 'image_analysis', 'function_calling', 'json_mode', 'streaming');--> statement-breakpoint
CREATE TYPE "public"."evaluator_status" AS ENUM('active', 'disabled', 'pending_validation', 'validation_failed');--> statement-breakpoint
CREATE TYPE "public"."permission_action" AS ENUM('read', 'write', 'delete', 'execute', 'manage', 'admin');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('organization', 'dataset', 'prompt', 'flow', 'eval_spec', 'run', 'model', 'provider', 'policy', 'baseline');--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar NOT NULL,
	"entity_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"changes" jsonb,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"encrypted_key" text NOT NULL,
	"key_hash" varchar NOT NULL,
	"display_name" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password_hash" text,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'viewer' NOT NULL,
	"organization_id" varchar NOT NULL,
	"entra_id" varchar,
	"upn" varchar,
	"tenant_id" varchar,
	"department" varchar,
	"job_title" varchar,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_entra_id_unique" UNIQUE("entra_id")
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_spec_id" varchar NOT NULL,
	"run_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"metrics" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dataset_samples" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" varchar NOT NULL,
	"sample_index" integer NOT NULL,
	"input" jsonb NOT NULL,
	"expected" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"description" text,
	"schema" jsonb,
	"sample_count" integer NOT NULL,
	"content_hash" varchar NOT NULL,
	"storage_url" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "datasets_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "eval_specs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"description" text,
	"prompt_id" varchar,
	"flow_id" varchar,
	"agent_id" varchar,
	"agent_version" varchar(50),
	"dataset_id" varchar NOT NULL,
	"evaluators" jsonb NOT NULL,
	"repetitions" integer DEFAULT 3 NOT NULL,
	"seeds" jsonb NOT NULL,
	"model_config" jsonb NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"flow_id" varchar NOT NULL,
	"workspace_id" varchar NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"content_hash" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "flows_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"content" text NOT NULL,
	"category" varchar DEFAULT 'general' NOT NULL,
	"content_hash" varchar NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "prompts_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
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
CREATE TABLE "runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"eval_spec_id" varchar NOT NULL,
	"policy_id" varchar,
	"agent_id" varchar,
	"agent_version" varchar(50),
	"status" varchar NOT NULL,
	"decision" varchar,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"metrics" jsonb,
	"cost" real,
	"duration" integer,
	"error_message" text,
	"triggered_by" varchar NOT NULL,
	"commit_sha" varchar,
	"organization_id" varchar NOT NULL,
	"description" text,
	"trace_events" jsonb,
	"trace_migrated_at" timestamp,
	"artifact_hashes" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sample_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"sample_index" integer NOT NULL,
	"repetition" integer NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"actual_output" jsonb,
	"evaluation_results" jsonb NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"suite_id" varchar NOT NULL,
	"scenario_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "simulation_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "simulation_scenarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"order" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "simulation_suites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"version" varchar NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trace_spans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar NOT NULL,
	"span_id" varchar NOT NULL,
	"parent_span_id" varchar,
	"name" varchar NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"attributes" jsonb DEFAULT '{}'::jsonb,
	"events" jsonb DEFAULT '[]'::jsonb,
	"run_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"rules" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "policy_violations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"policy_id" varchar NOT NULL,
	"rule_index" integer NOT NULL,
	"severity" varchar NOT NULL,
	"message" text NOT NULL,
	"evidence" jsonb,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	"severity" "alert_severity" DEFAULT 'medium' NOT NULL,
	"conditions" jsonb NOT NULL,
	"channels" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" varchar NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"title" varchar NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"notifications_sent" jsonb DEFAULT '[]'::jsonb,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cicd_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" "cicd_integration_type" NOT NULL,
	"repository_url" varchar,
	"webhook_secret" varchar,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cicd_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" varchar NOT NULL,
	"run_id" varchar,
	"external_run_id" varchar,
	"branch" varchar,
	"commit" varchar,
	"pull_request_number" integer,
	"status" "cicd_run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"quality_gate_result" varchar,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"signature" varchar,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"organization_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"type" "ai_provider_type" NOT NULL,
	"ai_sdk_provider" varchar,
	"base_url" varchar,
	"auth_method" varchar DEFAULT 'api_key' NOT NULL,
	"supported_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_config" jsonb DEFAULT '{}'::jsonb,
	"ai_sdk_config" jsonb DEFAULT '{}'::jsonb,
	"cost_per_token" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"health_status" varchar DEFAULT 'unknown' NOT NULL,
	"last_health_check" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"version_id" varchar,
	"benchmark_name" varchar NOT NULL,
	"score" real NOT NULL,
	"max_score" real NOT NULL,
	"score_type" varchar DEFAULT 'percentage' NOT NULL,
	"test_date" timestamp NOT NULL,
	"test_conditions" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_comparisons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"base_model_id" varchar NOT NULL,
	"compare_model_id" varchar NOT NULL,
	"dataset_id" varchar,
	"comparison_type" varchar NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"winner_model_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"model_id" varchar NOT NULL,
	"run_id" varchar,
	"date" timestamp NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"avg_latency" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"version" varchar NOT NULL,
	"release_date" timestamp,
	"change_log" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"deprecation_notice" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_window" integer,
	"max_tokens" integer,
	"input_cost_per_1k" real,
	"output_cost_per_1k" real,
	"benchmark_scores" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"description" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context_window" integer,
	"max_tokens" integer,
	"input_cost_per_1k" real,
	"output_cost_per_1k" real,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organization_provider_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"credentials" jsonb,
	"quotas" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_health_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"status" varchar NOT NULL,
	"response_time" real,
	"error_message" text,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_evaluators" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"version" varchar DEFAULT '1.0.0' NOT NULL,
	"evaluator_type" varchar NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"file_name" varchar NOT NULL,
	"file_hash" varchar NOT NULL,
	"file_size" integer NOT NULL,
	"file_path" varchar NOT NULL,
	"status" "evaluator_status" DEFAULT 'pending_validation' NOT NULL,
	"validation_results" jsonb,
	"validation_error" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"usage" jsonb DEFAULT '{}'::jsonb,
	"execution_type" varchar DEFAULT 'sandbox',
	"sandbox_config" jsonb,
	"execution_timeout" integer DEFAULT 300,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluator_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluator_id" varchar NOT NULL,
	"run_id" varchar,
	"execution_time" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost" numeric(10, 4),
	"success" boolean NOT NULL,
	"error_message" text,
	"organization_id" varchar NOT NULL,
	"used_by" varchar NOT NULL,
	"used_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluator_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluator_id" varchar NOT NULL,
	"version" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"file_hash" varchar NOT NULL,
	"file_path" varchar NOT NULL,
	"change_log" text,
	"previous_version_id" varchar,
	"status" "evaluator_status" DEFAULT 'pending_validation' NOT NULL,
	"validation_results" jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "permission_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar NOT NULL,
	"user_id" varchar,
	"target_user_id" varchar,
	"resource_type" "resource_type",
	"resource_id" varchar,
	"permission" "permission_action",
	"role_id" varchar,
	"details" jsonb DEFAULT '{}'::jsonb,
	"performed_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"action" "permission_action" NOT NULL,
	"description" text,
	"is_system_permission" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resource_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"role_id" varchar,
	"resource_type" "resource_type" NOT NULL,
	"resource_id" varchar NOT NULL,
	"action" "permission_action" NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"granted_by" varchar NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"organization_id" varchar NOT NULL,
	"is_system_role" boolean DEFAULT false,
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"assigned_by" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "azure_deployments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azure_workspace_id" varchar NOT NULL,
	"deployment_name" varchar NOT NULL,
	"endpoint_name" varchar,
	"deployment_type" varchar NOT NULL,
	"model_name" varchar,
	"model_version" varchar,
	"endpoint_url" text,
	"status" varchar DEFAULT 'unknown' NOT NULL,
	"sku" jsonb,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "azure_ml_workspaces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azure_subscription_id" varchar NOT NULL,
	"workspace_name" varchar NOT NULL,
	"resource_group" varchar NOT NULL,
	"region" varchar NOT NULL,
	"description" text,
	"discovery_version" varchar,
	"sku" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "azure_openai_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azure_subscription_id" varchar NOT NULL,
	"account_name" varchar NOT NULL,
	"resource_group" varchar NOT NULL,
	"region" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"api_version" varchar DEFAULT '2024-10-21' NOT NULL,
	"sku" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "azure_openai_deployments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azure_openai_account_id" varchar NOT NULL,
	"deployment_name" varchar NOT NULL,
	"model_name" varchar NOT NULL,
	"model_version" varchar,
	"scale_type" varchar,
	"current_capacity" integer,
	"rai_policy_name" varchar,
	"status" varchar DEFAULT 'unknown' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "azure_prompt_flows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azure_workspace_id" varchar NOT NULL,
	"flow_name" varchar NOT NULL,
	"flow_version" varchar,
	"azure_flow_id" varchar NOT NULL,
	"description" text,
	"flow_type" varchar DEFAULT 'standard',
	"endpoint_url" text,
	"endpoint_name" varchar,
	"status" varchar DEFAULT 'discovered' NOT NULL,
	"flow_definition" jsonb,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "azure_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"subscription_id" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"state" varchar DEFAULT 'enabled' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"version" varchar(50) NOT NULL,
	"version_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"change_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" varchar(50) NOT NULL,
	"version_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"model_provider" varchar(100),
	"model_name" varchar(200),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sandbox_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_id" varchar NOT NULL,
	"operation" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"resource_usage" jsonb,
	"security_violations" jsonb,
	"code_hash" varchar,
	"request_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dataset_samples" ADD CONSTRAINT "dataset_samples_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_annotation_id_run_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."run_annotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_promoted_to_dataset_id_datasets_id_fk" FOREIGN KEY ("promoted_to_dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_promoted_to_scenario_id_simulation_scenarios_id_fk" FOREIGN KEY ("promoted_to_scenario_id") REFERENCES "public"."simulation_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_annotations" ADD CONSTRAINT "run_annotations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_annotations" ADD CONSTRAINT "run_annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_suite_id_simulation_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."simulation_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_scenario_id_simulation_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."simulation_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_scenarios" ADD CONSTRAINT "simulation_scenarios_suite_id_simulation_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."simulation_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_spans" ADD CONSTRAINT "trace_spans_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_benchmarks" ADD CONSTRAINT "model_benchmarks_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_benchmarks" ADD CONSTRAINT "model_benchmarks_version_id_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_comparisons" ADD CONSTRAINT "model_comparisons_base_model_id_models_id_fk" FOREIGN KEY ("base_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_comparisons" ADD CONSTRAINT "model_comparisons_compare_model_id_models_id_fk" FOREIGN KEY ("compare_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_comparisons" ADD CONSTRAINT "model_comparisons_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_comparisons" ADD CONSTRAINT "model_comparisons_winner_model_id_models_id_fk" FOREIGN KEY ("winner_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_usage" ADD CONSTRAINT "evaluator_usage_evaluator_id_custom_evaluators_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."custom_evaluators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_usage" ADD CONSTRAINT "evaluator_usage_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator_versions" ADD CONSTRAINT "evaluator_versions_evaluator_id_custom_evaluators_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."custom_evaluators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_audit_log" ADD CONSTRAINT "permission_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_audit_log" ADD CONSTRAINT "permission_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_audit_log" ADD CONSTRAINT "permission_audit_log_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_audit_log" ADD CONSTRAINT "permission_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_permissions" ADD CONSTRAINT "resource_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_deployments" ADD CONSTRAINT "azure_deployments_azure_workspace_id_azure_ml_workspaces_id_fk" FOREIGN KEY ("azure_workspace_id") REFERENCES "public"."azure_ml_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_ml_workspaces" ADD CONSTRAINT "azure_ml_workspaces_azure_subscription_id_azure_subscriptions_id_fk" FOREIGN KEY ("azure_subscription_id") REFERENCES "public"."azure_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_openai_accounts" ADD CONSTRAINT "azure_openai_accounts_azure_subscription_id_azure_subscriptions_id_fk" FOREIGN KEY ("azure_subscription_id") REFERENCES "public"."azure_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_openai_deployments" ADD CONSTRAINT "azure_openai_deployments_azure_openai_account_id_azure_openai_accounts_id_fk" FOREIGN KEY ("azure_openai_account_id") REFERENCES "public"."azure_openai_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_prompt_flows" ADD CONSTRAINT "azure_prompt_flows_azure_workspace_id_azure_ml_workspaces_id_fk" FOREIGN KEY ("azure_workspace_id") REFERENCES "public"."azure_ml_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_subscriptions" ADD CONSTRAINT "azure_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_review_queue_run_id" ON "review_queue_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_review_queue_status" ON "review_queue_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_review_queue_priority" ON "review_queue_items" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_review_queue_assignee" ON "review_queue_items" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_review_queue_source_type" ON "review_queue_items" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_run_id" ON "run_annotations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_span_id" ON "run_annotations" USING btree ("span_id");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_label" ON "run_annotations" USING btree ("label");--> statement-breakpoint
CREATE INDEX "idx_run_annotations_severity" ON "run_annotations" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_trace_spans_trace_id" ON "trace_spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_trace_spans_span_id" ON "trace_spans" USING btree ("span_id");--> statement-breakpoint
CREATE INDEX "idx_trace_spans_parent_span_id" ON "trace_spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX "idx_trace_spans_run_id" ON "trace_spans" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_trace_spans_organization_id" ON "trace_spans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_custom_evaluators_org" ON "custom_evaluators" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_custom_evaluators_status" ON "custom_evaluators" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_custom_evaluators_type" ON "custom_evaluators" USING btree ("evaluator_type");--> statement-breakpoint
CREATE INDEX "idx_custom_evaluators_hash" ON "custom_evaluators" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "idx_evaluator_usage_evaluator" ON "evaluator_usage" USING btree ("evaluator_id");--> statement-breakpoint
CREATE INDEX "idx_evaluator_usage_run" ON "evaluator_usage" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_evaluator_usage_org_date" ON "evaluator_usage" USING btree ("organization_id","used_at");--> statement-breakpoint
CREATE INDEX "idx_evaluator_versions_evaluator" ON "evaluator_versions" USING btree ("evaluator_id");--> statement-breakpoint
CREATE INDEX "idx_evaluator_versions_version" ON "evaluator_versions" USING btree ("evaluator_id","version");--> statement-breakpoint
CREATE INDEX "idx_permission_audit_user" ON "permission_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_permission_audit_date" ON "permission_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_permissions_resource_action" ON "permissions" USING btree ("resource_type","action");--> statement-breakpoint
CREATE INDEX "idx_resource_permissions_user" ON "resource_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_resource_permissions_resource" ON "resource_permissions" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_resource_permissions_role" ON "resource_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_role" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_permission" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "idx_roles_org" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_user" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_role" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_azure_deployment_workspace" ON "azure_deployments" USING btree ("azure_workspace_id");--> statement-breakpoint
CREATE INDEX "idx_azure_deployment_name" ON "azure_deployments" USING btree ("deployment_name");--> statement-breakpoint
CREATE INDEX "idx_azure_deployment_type" ON "azure_deployments" USING btree ("deployment_type");--> statement-breakpoint
CREATE INDEX "idx_azure_workspace_subscription" ON "azure_ml_workspaces" USING btree ("azure_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_azure_workspace_name" ON "azure_ml_workspaces" USING btree ("workspace_name");--> statement-breakpoint
CREATE INDEX "idx_azure_openai_subscription" ON "azure_openai_accounts" USING btree ("azure_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_azure_openai_account" ON "azure_openai_accounts" USING btree ("account_name");--> statement-breakpoint
CREATE INDEX "idx_azure_openai_deployment_account" ON "azure_openai_deployments" USING btree ("azure_openai_account_id");--> statement-breakpoint
CREATE INDEX "idx_azure_openai_deployment_name" ON "azure_openai_deployments" USING btree ("deployment_name");--> statement-breakpoint
CREATE INDEX "idx_azure_flow_workspace" ON "azure_prompt_flows" USING btree ("azure_workspace_id");--> statement-breakpoint
CREATE INDEX "idx_azure_flow_name" ON "azure_prompt_flows" USING btree ("flow_name");--> statement-breakpoint
CREATE INDEX "idx_azure_flow_status" ON "azure_prompt_flows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_azure_subscription_user" ON "azure_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_azure_subscription_id" ON "azure_subscriptions" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_unique_idx" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_hash_idx" ON "agent_versions" USING btree ("agent_id","version_hash");--> statement-breakpoint
CREATE INDEX "agents_org_name_idx" ON "agents" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "agents_org_active_idx" ON "agents" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "idx_sandbox_audit_sandbox_id" ON "sandbox_audit_log" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "idx_sandbox_audit_org_id" ON "sandbox_audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_sandbox_audit_created_at" ON "sandbox_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sandbox_audit_code_hash" ON "sandbox_audit_log" USING btree ("code_hash");