-- Row Level Security (RLS) policies for multi-tenant isolation
-- Run this migration after creating all tables.
-- Each policy enforces that queries only see rows belonging to the current tenant.
-- The tenant is set per-request via: SET LOCAL app.org_id = '<uuid>';

-- Enable RLS on all tenant-scoped tables
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trace_spans ENABLE ROW LEVEL SECURITY;

-- RLS Policies: tenant isolation via session variable app.org_id
CREATE POLICY tenant_isolation ON prompts
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON flows
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON datasets
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON dataset_samples
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON eval_specs
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON runs
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON agents
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON agent_versions
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON policies
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON policy_violations
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON baselines
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON sample_results
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON simulation_suites
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON simulation_scenarios
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON simulation_runs
  USING (organization_id = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON trace_spans
  USING (organization_id = current_setting('app.org_id', true)::text);

-- Additional tenant-scoped tables identified post-initial-migration
ALTER TABLE run_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE cicd_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cicd_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON run_annotations
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON review_queue_items
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON custom_evaluators
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON cicd_integrations
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON cicd_runs
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON webhook_events
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON alert_configs
  USING (organization_id = current_setting('app.org_id', true)::text);
CREATE POLICY tenant_isolation ON alert_events
  USING (organization_id = current_setting('app.org_id', true)::text);

-- Grant bypass to the migration role (superuser already bypasses RLS)
-- The application role should NOT have BYPASSRLS
