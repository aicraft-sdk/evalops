import {
  users,
  userApiKeys,
  organizations,
  prompts,
  flows,
  datasets,
  datasetSamples,
  evalSpecs,
  runs,
  baselines,
  policies,
  policyViolations,
  sampleResults,
  auditTrail,
  cicdIntegrations,
  cicdRuns,
  webhookEvents,
  alertConfigs,
  alertEvents,
  type User,
  type UpsertUser,
  type UserApiKey,
  type InsertUserApiKey,
  type Organization,
  type InsertOrganization,
  type Prompt,
  type InsertPrompt,
  type Flow,
  type InsertFlow,
  type Dataset,
  type InsertDataset,
  type DatasetSample,
  type InsertDatasetSample,
  type EvalSpec,
  type InsertEvalSpec,
  type Run,
  type InsertRun,
  type Baseline,
  type InsertBaseline,
  type Policy,
  type InsertPolicy,
  type PolicyViolation,
  type InsertPolicyViolation,
  type SampleResult,
  type InsertSampleResult,
  type AuditTrail,
  type InsertAuditTrail,
  type EnhancedAuditEntry,
  type CicdIntegration,
  type InsertCicdIntegration,
  type CicdRun,
  type InsertCicdRun,
  type WebhookEvent,
  type InsertWebhookEvent,
  type AlertConfig,
  type InsertAlertConfig,
  type AlertEvent,
  type InsertAlertEvent,
  // AI Provider types
  aiProviders,
  models,
  organizationProviderConfigs,
  modelUsage,
  providerHealthChecks,
  modelVersions,
  modelBenchmarks,
  modelComparisons,
  type AiProvider,
  type InsertAiProvider,
  type Model,
  type InsertModel,
  type OrganizationProviderConfig,
  type InsertOrganizationProviderConfig,
  // Azure ML Integration types
  azureSubscriptions,
  azureMLWorkspaces,
  azureDeployments,
  azurePromptFlows,
  azureOpenAIAccounts,
  azureOpenAIDeployments,
  type AzureSubscription,
  type InsertAzureSubscription,
  type AzureMLWorkspace,
  type InsertAzureMLWorkspace,
  type AzureDeployment,
  type InsertAzureDeployment,
  type AzurePromptFlow,
  type InsertAzurePromptFlow,
  type AzureOpenAIAccount,
  type InsertAzureOpenAIAccount,
  type AzureOpenAIDeployment,
  type InsertAzureOpenAIDeployment,
  type ModelUsage,
  type InsertModelUsage,
  // Custom Evaluator types
  customEvaluators,
  evaluatorVersions,
  evaluatorUsage,
  type CustomEvaluator,
  type InsertCustomEvaluator,
  type EvaluatorVersion,
  type InsertEvaluatorVersion,
  type EvaluatorUsage,
  type InsertEvaluatorUsage,
  // Permission System types
  roles,
  userRoles,
  permissions,
  rolePermissions,
  resourcePermissions,
  permissionAuditLog,
  type Role,
  type InsertRole,
  type UserRole,
  type InsertUserRole,
  type Permission,
  type InsertPermission,
  type RolePermission,
  type InsertRolePermission,
  type ResourcePermission,
  type InsertResourcePermission,
  type PermissionAuditLog,
  type InsertPermissionAuditLog,
  type ProviderHealthCheck,
  type InsertProviderHealthCheck,
  type ModelVersion,
  type InsertModelVersion,
  type ModelBenchmark,
  type InsertModelBenchmark,
  type ModelComparison,
  type InsertModelComparison,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, count, sql, gte, lte, inArray } from "drizzle-orm";
import crypto from "crypto";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Organization operations
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  
  // Prompt operations
  getPrompts(organizationId: string): Promise<Prompt[]>;
  getPrompt(id: string): Promise<Prompt | undefined>;
  createPrompt(prompt: InsertPrompt): Promise<Prompt>;
  updatePrompt(id: string, prompt: Partial<InsertPrompt>): Promise<Prompt>;
  deletePrompt(id: string): Promise<void>;
  
  // Flow operations
  getFlows(organizationId: string): Promise<Flow[]>;
  getFlow(id: string): Promise<Flow | undefined>;
  createFlow(flow: InsertFlow): Promise<Flow>;
  updateFlow(id: string, flow: Partial<InsertFlow>): Promise<Flow>;
  deleteFlow(id: string): Promise<void>;
  
  // Dataset operations
  getDatasets(organizationId: string): Promise<Dataset[]>;
  getDataset(id: string): Promise<Dataset | undefined>;
  createDataset(dataset: InsertDataset): Promise<Dataset>;
  updateDataset(id: string, dataset: Partial<InsertDataset>): Promise<Dataset>;
  deleteDataset(id: string): Promise<void>;
  findDatasetByContentHash(contentHash: string): Promise<Dataset | undefined>;
  
  // Dataset samples operations
  getDatasetSamples(datasetId: string): Promise<DatasetSample[]>;
  createDatasetSample(sample: InsertDatasetSample): Promise<DatasetSample>;
  createDatasetSamples(samples: InsertDatasetSample[]): Promise<DatasetSample[]>;
  deleteDatasetSamples(datasetId: string): Promise<void>;
  
  // EvalSpec operations
  getEvalSpecs(organizationId: string): Promise<EvalSpec[]>;
  getEvalSpec(id: string): Promise<EvalSpec | undefined>;
  createEvalSpec(evalSpec: InsertEvalSpec): Promise<EvalSpec>;
  updateEvalSpec(id: string, evalSpec: Partial<InsertEvalSpec>): Promise<EvalSpec>;
  deleteEvalSpec(id: string): Promise<void>;
  
  // Run operations
  getRuns(organizationId: string, limit?: number): Promise<Run[]>;
  getRun(id: string): Promise<Run | undefined>;
  createRun(run: InsertRun): Promise<Run>;
  updateRun(id: string, run: Partial<InsertRun>): Promise<Run>;
  getRunsByEvalSpec(evalSpecId: string): Promise<Run[]>;
  
  // Baseline operations
  getBaselines(organizationId: string): Promise<Baseline[]>;
  getBaseline(id: string): Promise<Baseline | undefined>;
  createBaseline(baseline: InsertBaseline): Promise<Baseline>;
  updateBaseline(id: string, baseline: Partial<InsertBaseline>): Promise<Baseline>;
  getActiveBaseline(evalSpecId: string): Promise<Baseline | undefined>;
  
  // Policy operations
  getPolicies(organizationId: string): Promise<Policy[]>;
  getPolicy(id: string): Promise<Policy | undefined>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicy(id: string, policy: Partial<InsertPolicy>): Promise<Policy>;
  deletePolicy(id: string): Promise<void>;
  getActivePolicies(organizationId: string): Promise<Policy[]>;
  
  // Policy Violation operations
  getPolicyViolations(organizationId: string, limit?: number): Promise<PolicyViolation[]>;
  createPolicyViolation(violation: InsertPolicyViolation): Promise<PolicyViolation>;
  getPolicyViolationsByRun(runId: string): Promise<PolicyViolation[]>;
  
  // Sample Results operations
  getSampleResults(runId: string): Promise<SampleResult[]>;
  createSampleResult(sampleResult: InsertSampleResult): Promise<SampleResult>;
  
  // User API Keys operations
  getUserApiKeys(userId: string, provider?: string): Promise<UserApiKey[]>;
  getUserApiKey(userId: string, provider: string): Promise<UserApiKey | undefined>;
  createUserApiKey(apiKey: InsertUserApiKey): Promise<UserApiKey>;
  updateUserApiKey(id: string, apiKey: Partial<InsertUserApiKey>): Promise<UserApiKey>;
  deleteUserApiKey(id: string): Promise<void>;
  
  // Audit Trail operations
  getAuditTrail(organizationId: string, limit?: number): Promise<AuditTrail[]>;
  getAuditTrailEnhanced(organizationId: string, limit?: number): Promise<EnhancedAuditEntry[]>;
  createAuditEntry(entry: InsertAuditTrail): Promise<AuditTrail>;
  
  // Dashboard/Statistics operations
  getDashboardStats(organizationId: string): Promise<{
    activeRuns: number;
    passRate: number;
    avgCost: number;
    p95Latency: number;
  }>;

  // CI/CD Integration operations
  createCicdIntegration(data: InsertCicdIntegration): Promise<CicdIntegration>;
  getCicdIntegrations(organizationId: string): Promise<CicdIntegration[]>;
  getCicdIntegrationById(id: string): Promise<CicdIntegration | undefined>;
  updateCicdIntegration(id: string, data: Partial<InsertCicdIntegration>): Promise<CicdIntegration>;
  deleteCicdIntegration(id: string): Promise<void>;

  // CI/CD Run operations
  createCicdRun(data: InsertCicdRun): Promise<CicdRun>;
  getCicdRuns(organizationId: string, limit?: number): Promise<CicdRun[]>;
  getCicdRunById(id: string): Promise<CicdRun | undefined>;
  updateCicdRun(id: string, data: Partial<InsertCicdRun>): Promise<CicdRun>;

  // Webhook Event operations
  createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent>;
  getWebhookEvents(organizationId: string, limit?: number): Promise<WebhookEvent[]>;

  // Alert Config operations
  createAlertConfig(data: InsertAlertConfig): Promise<AlertConfig>;
  getAlertConfigs(organizationId: string): Promise<AlertConfig[]>;
  updateAlertConfig(id: string, data: Partial<InsertAlertConfig>): Promise<AlertConfig>;
  deleteAlertConfig(id: string): Promise<void>;

  // Alert Event operations
  createAlertEvent(data: InsertAlertEvent): Promise<AlertEvent>;
  getRecentAlertEvents(organizationId: string, limit?: number): Promise<AlertEvent[]>;
  acknowledgeAlertEvent(id: string, userId: string): Promise<AlertEvent>;
  resolveAlertEvent(id: string, userId: string): Promise<AlertEvent>;

  // AI Provider operations
  getActiveAIProviders(): Promise<AiProvider[]>;
  getAIProvider(id: string): Promise<AiProvider | undefined>;
  createAIProvider(data: InsertAiProvider): Promise<AiProvider>;
  updateAIProviderHealth(id: string, status: string): Promise<void>;

  // Model operations
  getModelByProviderAndName(providerId: string, modelName: string): Promise<Model | undefined>;
  createModel(data: InsertModel): Promise<Model>;
  getModels(providerId?: string): Promise<Model[]>;
  getModelById(id: string): Promise<Model | undefined>;
  
  // Model Registry operations
  getModelVersions(modelId: string): Promise<ModelVersion[]>;
  createModelVersion(version: InsertModelVersion): Promise<ModelVersion>;
  getModelBenchmarks(modelId: string): Promise<ModelBenchmark[]>;
  createModelBenchmark(benchmark: InsertModelBenchmark): Promise<ModelBenchmark>;
  getModelComparisons(organizationId: string): Promise<ModelComparison[]>;
  createModelComparison(comparison: InsertModelComparison): Promise<ModelComparison>;
  getModelsWithVersions(): Promise<Array<Model & { latestVersion?: ModelVersion }>>;

  // Organization Provider Config operations
  getOrganizationProviderConfigs(organizationId: string): Promise<OrganizationProviderConfig[]>;
  getProviderConfig(providerId: string): Promise<OrganizationProviderConfig | undefined>;
  createOrganizationProviderConfig(data: InsertOrganizationProviderConfig): Promise<OrganizationProviderConfig>;

  // Model Usage operations
  createModelUsage(data: InsertModelUsage): Promise<ModelUsage>;
  getModelUsageByOrganization(organizationId: string, startDate?: Date, endDate?: Date): Promise<ModelUsage[]>;

  // Provider Health Check operations
  createProviderHealthCheck(data: InsertProviderHealthCheck): Promise<ProviderHealthCheck>;
  getRecentProviderHealthChecks(providerId: string, limit?: number): Promise<ProviderHealthCheck[]>;

  // ============= PERMISSION SYSTEM OPERATIONS =============
  
  // Role operations
  getRoles(organizationId: string): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  
  // User role operations
  getUserRoles(userId: string): Promise<Role[]>;
  getUsersByRole(roleId: string): Promise<User[]>;
  createUserRole(userRole: InsertUserRole): Promise<UserRole>;
  removeUserRole(userId: string, roleId: string): Promise<void>;
  
  // Permission operations
  getPermissions(): Promise<Permission[]>;
  getPermission(id: string): Promise<Permission | undefined>;
  getPermissionByTypeAndAction(resourceType: string, action: string): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  getUserPermissions(userId: string): Promise<Permission[]>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
  
  // Role permission operations
  createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission>;
  removeRolePermission(roleId: string, permissionId: string): Promise<void>;
  
  // Resource permission operations
  getResourcePermissions(resourceType: string, resourceId: string): Promise<ResourcePermission[]>;
  getUserResourcePermissions(userId: string): Promise<ResourcePermission[]>;
  createResourcePermission(resourcePermission: InsertResourcePermission): Promise<ResourcePermission>;
  removeResourcePermission(id: string): Promise<void>;
  
  // Permission audit operations
  createPermissionAuditLog(auditLog: InsertPermissionAuditLog): Promise<PermissionAuditLog>;
  getPermissionAuditLogs(organizationId: string, limit?: number): Promise<PermissionAuditLog[]>;
  
  // Custom Evaluator operations
  getCustomEvaluators(organizationId: string, filters?: {
    status?: string;
    evaluatorType?: string;
    tags?: string[];
    includePublic?: boolean;
  }): Promise<CustomEvaluator[]>;
  getCustomEvaluator(id: string): Promise<CustomEvaluator | undefined>;
  createCustomEvaluator(evaluator: InsertCustomEvaluator): Promise<CustomEvaluator>;
  updateCustomEvaluator(id: string, evaluator: Partial<InsertCustomEvaluator>): Promise<CustomEvaluator>;
  deleteCustomEvaluator(id: string): Promise<void>;
  findCustomEvaluatorByHash(fileHash: string): Promise<CustomEvaluator | undefined>;
  
  // Evaluator Usage operations
  createEvaluatorUsage(usage: InsertEvaluatorUsage): Promise<EvaluatorUsage>;
  getEvaluatorActiveUsage(evaluatorId: string): Promise<number>;
  getEvaluatorUsageStats(evaluatorId: string, organizationId: string, days: number): Promise<{
    totalExecutions: number;
    successRate: number;
    avgExecutionTime: number;
    totalCost: number;
    usageOverTime: any[];
  }>;

  // ============= AZURE ML INTEGRATION OPERATIONS =============

  // Azure Subscription operations
  getAzureSubscriptions(userId: string): Promise<AzureSubscription[]>;
  getAzureSubscription(id: string): Promise<AzureSubscription | undefined>;
  createAzureSubscription(subscription: InsertAzureSubscription): Promise<AzureSubscription>;
  updateAzureSubscription(id: string, subscription: Partial<InsertAzureSubscription>): Promise<AzureSubscription>;
  deleteAzureSubscription(id: string): Promise<void>;
  findAzureSubscriptionBySubscriptionId(subscriptionId: string, userId: string): Promise<AzureSubscription | undefined>;

  // Azure ML Workspace operations
  getAzureMLWorkspaces(subscriptionId: string): Promise<AzureMLWorkspace[]>;
  getAzureMLWorkspace(id: string): Promise<AzureMLWorkspace | undefined>;
  createAzureMLWorkspace(workspace: InsertAzureMLWorkspace): Promise<AzureMLWorkspace>;
  updateAzureMLWorkspace(id: string, workspace: Partial<InsertAzureMLWorkspace>): Promise<AzureMLWorkspace>;
  deleteAzureMLWorkspace(id: string): Promise<void>;
  getAzureMLWorkspacesByUser(userId: string): Promise<AzureMLWorkspace[]>;

  // Azure Deployment operations
  getAzureDeployments(workspaceId: string): Promise<AzureDeployment[]>;
  getAzureDeployment(id: string): Promise<AzureDeployment | undefined>;
  createAzureDeployment(deployment: InsertAzureDeployment): Promise<AzureDeployment>;
  updateAzureDeployment(id: string, deployment: Partial<InsertAzureDeployment>): Promise<AzureDeployment>;
  deleteAzureDeployment(id: string): Promise<void>;
  getAzureDeploymentsByUser(userId: string): Promise<AzureDeployment[]>;

  // Azure Prompt Flow operations
  getAzurePromptFlows(workspaceId: string): Promise<AzurePromptFlow[]>;
  getAzurePromptFlow(id: string): Promise<AzurePromptFlow | undefined>;
  createAzurePromptFlow(flow: InsertAzurePromptFlow): Promise<AzurePromptFlow>;
  updateAzurePromptFlow(id: string, flow: Partial<InsertAzurePromptFlow>): Promise<AzurePromptFlow>;
  deleteAzurePromptFlow(id: string): Promise<void>;
  getAzurePromptFlowsByUser(userId: string): Promise<AzurePromptFlow[]>;

  // Azure OpenAI Account operations
  getAzureOpenAIAccounts(subscriptionId: string): Promise<AzureOpenAIAccount[]>;
  getAzureOpenAIAccount(id: string): Promise<AzureOpenAIAccount | undefined>;
  createAzureOpenAIAccount(account: InsertAzureOpenAIAccount): Promise<AzureOpenAIAccount>;
  updateAzureOpenAIAccount(id: string, account: Partial<InsertAzureOpenAIAccount>): Promise<AzureOpenAIAccount>;
  deleteAzureOpenAIAccount(id: string): Promise<void>;
  getAzureOpenAIAccountsByUser(userId: string): Promise<AzureOpenAIAccount[]>;

  // Azure OpenAI Deployment operations
  getAzureOpenAIDeployments(accountId: string): Promise<AzureOpenAIDeployment[]>;
  getAzureOpenAIDeployment(id: string): Promise<AzureOpenAIDeployment | undefined>;
  createAzureOpenAIDeployment(deployment: InsertAzureOpenAIDeployment): Promise<AzureOpenAIDeployment>;
  updateAzureOpenAIDeployment(id: string, deployment: Partial<InsertAzureOpenAIDeployment>): Promise<AzureOpenAIDeployment>;
  deleteAzureOpenAIDeployment(id: string): Promise<void>;
  getAzureOpenAIDeploymentsByUser(userId: string): Promise<AzureOpenAIDeployment[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values([userData])
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Organization operations
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization;
  }

  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    const [newOrg] = await db.insert(organizations).values([organization]).returning();
    return newOrg;
  }

  // Prompt operations
  async getPrompts(organizationId: string): Promise<Prompt[]> {
    return await db.select().from(prompts)
      .where(eq(prompts.organizationId, organizationId))
      .orderBy(desc(prompts.createdAt));
  }

  async getPrompt(id: string): Promise<Prompt | undefined> {
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
    return prompt;
  }

  async createPrompt(prompt: InsertPrompt): Promise<Prompt> {
    const contentHash = this.generateContentHash(prompt.content);
    const [newPrompt] = await db.insert(prompts).values([{ ...prompt, contentHash }]).returning();
    return newPrompt;
  }

  async updatePrompt(id: string, prompt: Partial<InsertPrompt>): Promise<Prompt> {
    const [updatedPrompt] = await db.update(prompts)
      .set(prompt)
      .where(eq(prompts.id, id))
      .returning();
    return updatedPrompt;
  }

  async deletePrompt(id: string): Promise<void> {
    await db.delete(prompts).where(eq(prompts.id, id));
  }

  async findPromptByContentHash(contentHash: string): Promise<Prompt | undefined> {
    const [prompt] = await db.select().from(prompts).where(eq(prompts.contentHash, contentHash));
    return prompt;
  }

  // Flow operations
  async getFlows(organizationId: string): Promise<Flow[]> {
    return await db.select().from(flows)
      .where(eq(flows.organizationId, organizationId))
      .orderBy(desc(flows.createdAt));
  }

  async getFlow(id: string): Promise<Flow | undefined> {
    const [flow] = await db.select().from(flows).where(eq(flows.id, id));
    return flow;
  }

  async createFlow(flow: InsertFlow): Promise<Flow> {
    const contentHash = this.generateContentHash(JSON.stringify(flow));
    const [newFlow] = await db.insert(flows).values([{ ...flow, contentHash }]).returning();
    return newFlow;
  }

  async updateFlow(id: string, flow: Partial<InsertFlow>): Promise<Flow> {
    const [updatedFlow] = await db.update(flows)
      .set(flow)
      .where(eq(flows.id, id))
      .returning();
    return updatedFlow;
  }

  async deleteFlow(id: string): Promise<void> {
    await db.delete(flows).where(eq(flows.id, id));
  }

  // Dataset operations
  async getDatasets(organizationId: string): Promise<Dataset[]> {
    return await db.select().from(datasets)
      .where(eq(datasets.organizationId, organizationId))
      .orderBy(desc(datasets.createdAt));
  }

  async getDataset(id: string): Promise<Dataset | undefined> {
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id));
    return dataset;
  }

  async createDataset(dataset: InsertDataset): Promise<Dataset> {
    // Generate content hash since it's not part of InsertDataset type
    const datasetWithHash = {
      ...dataset,
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    const [newDataset] = await db.insert(datasets).values([datasetWithHash]).returning();
    return newDataset;
  }

  async updateDataset(id: string, dataset: Partial<InsertDataset>): Promise<Dataset> {
    const [updatedDataset] = await db.update(datasets)
      .set(dataset)
      .where(eq(datasets.id, id))
      .returning();
    return updatedDataset;
  }

  async deleteDataset(id: string): Promise<void> {
    await db.delete(datasets).where(eq(datasets.id, id));
  }

  async findDatasetByContentHash(contentHash: string): Promise<Dataset | undefined> {
    const [dataset] = await db.select().from(datasets).where(eq(datasets.contentHash, contentHash));
    return dataset;
  }

  // EvalSpec operations
  async getEvalSpecs(organizationId: string): Promise<EvalSpec[]> {
    return await db.select().from(evalSpecs)
      .where(eq(evalSpecs.organizationId, organizationId))
      .orderBy(desc(evalSpecs.createdAt));
  }

  async getEvalSpec(id: string): Promise<EvalSpec | undefined> {
    const [evalSpec] = await db.select().from(evalSpecs).where(eq(evalSpecs.id, id));
    return evalSpec;
  }

  async createEvalSpec(evalSpec: InsertEvalSpec): Promise<EvalSpec> {
    const [newEvalSpec] = await db.insert(evalSpecs).values([evalSpec]).returning();
    return newEvalSpec;
  }

  async updateEvalSpec(id: string, evalSpec: Partial<InsertEvalSpec>): Promise<EvalSpec> {
    const [updatedEvalSpec] = await db.update(evalSpecs)
      .set(evalSpec)
      .where(eq(evalSpecs.id, id))
      .returning();
    return updatedEvalSpec;
  }

  async deleteEvalSpec(id: string): Promise<void> {
    await db.delete(evalSpecs).where(eq(evalSpecs.id, id));
  }

  // Run operations
  async getRuns(organizationId: string, limit = 50): Promise<Run[]> {
    return await db.select().from(runs)
      .where(eq(runs.organizationId, organizationId))
      .orderBy(desc(runs.createdAt))
      .limit(limit);
  }

  async getRun(id: string): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    return run;
  }

  async createRun(run: InsertRun): Promise<Run> {
    const [newRun] = await db.insert(runs).values([run]).returning();
    return newRun;
  }

  async updateRun(id: string, run: Partial<InsertRun>): Promise<Run> {
    const [updatedRun] = await db.update(runs)
      .set(run)
      .where(eq(runs.id, id))
      .returning();
    return updatedRun;
  }

  async getRunsByEvalSpec(evalSpecId: string): Promise<Run[]> {
    return await db.select().from(runs)
      .where(eq(runs.evalSpecId, evalSpecId))
      .orderBy(desc(runs.createdAt));
  }

  // Baseline operations
  async getBaselines(organizationId: string): Promise<Baseline[]> {
    return await db.select().from(baselines)
      .where(eq(baselines.organizationId, organizationId))
      .orderBy(desc(baselines.createdAt));
  }

  async getBaseline(id: string): Promise<Baseline | undefined> {
    const [baseline] = await db.select().from(baselines).where(eq(baselines.id, id));
    return baseline;
  }

  async createBaseline(baseline: InsertBaseline): Promise<Baseline> {
    const [newBaseline] = await db.insert(baselines).values([baseline]).returning();
    return newBaseline;
  }

  async updateBaseline(id: string, baseline: Partial<InsertBaseline>): Promise<Baseline> {
    const [updatedBaseline] = await db.update(baselines)
      .set(baseline)
      .where(eq(baselines.id, id))
      .returning();
    return updatedBaseline;
  }

  async getActiveBaseline(evalSpecId: string): Promise<Baseline | undefined> {
    const [baseline] = await db.select().from(baselines)
      .where(and(
        eq(baselines.evalSpecId, evalSpecId),
        eq(baselines.isActive, true)
      ))
      .orderBy(desc(baselines.createdAt))
      .limit(1);
    return baseline;
  }

  async getLatestBaseline(evalSpecId: string): Promise<Baseline | undefined> {
    const [baseline] = await db.select().from(baselines)
      .where(eq(baselines.evalSpecId, evalSpecId))
      .orderBy(desc(baselines.createdAt))
      .limit(1);
    return baseline;
  }

  // Policy operations
  async getPolicies(organizationId: string): Promise<Policy[]> {
    return await db.select().from(policies)
      .where(eq(policies.organizationId, organizationId))
      .orderBy(desc(policies.createdAt));
  }


  async getPolicy(id: string): Promise<Policy | undefined> {
    const [policy] = await db.select().from(policies).where(eq(policies.id, id));
    return policy;
  }

  async createPolicy(policy: InsertPolicy): Promise<Policy> {
    const [newPolicy] = await db.insert(policies).values([policy]).returning();
    return newPolicy;
  }

  async updatePolicy(id: string, policy: Partial<InsertPolicy>): Promise<Policy> {
    const [updatedPolicy] = await db.update(policies)
      .set({ ...policy, updatedAt: new Date() })
      .where(eq(policies.id, id))
      .returning();
    return updatedPolicy;
  }

  async deletePolicy(id: string): Promise<void> {
    await db.delete(policies).where(eq(policies.id, id));
  }

  async getActivePolicies(organizationId: string): Promise<Policy[]> {
    return await db.select().from(policies)
      .where(and(
        eq(policies.organizationId, organizationId),
        eq(policies.isActive, true)
      ));
  }

  // Policy Violation operations
  async getPolicyViolations(organizationId: string, limit = 50): Promise<PolicyViolation[]> {
    return await db.select().from(policyViolations)
      .where(eq(policyViolations.organizationId, organizationId))
      .orderBy(desc(policyViolations.createdAt))
      .limit(limit);
  }

  async createPolicyViolation(violation: InsertPolicyViolation): Promise<PolicyViolation> {
    const [newViolation] = await db.insert(policyViolations).values(violation).returning();
    return newViolation;
  }

  async getPolicyViolationsByRun(runId: string): Promise<PolicyViolation[]> {
    return await db.select().from(policyViolations)
      .where(eq(policyViolations.runId, runId));
  }

  // Sample Results operations
  async getSampleResults(runId: string): Promise<SampleResult[]> {
    return await db.select().from(sampleResults)
      .where(eq(sampleResults.runId, runId))
      .orderBy(sampleResults.sampleIndex, sampleResults.repetition);
  }

  // Dataset samples operations
  async getDatasetSamples(datasetId: string): Promise<DatasetSample[]> {
    return await db.select().from(datasetSamples)
      .where(eq(datasetSamples.datasetId, datasetId))
      .orderBy(datasetSamples.sampleIndex);
  }

  async createDatasetSample(sample: InsertDatasetSample): Promise<DatasetSample> {
    const [newSample] = await db.insert(datasetSamples).values(sample).returning();
    return newSample;
  }

  async createDatasetSamples(samples: InsertDatasetSample[]): Promise<DatasetSample[]> {
    return await db.insert(datasetSamples).values(samples).returning();
  }

  async deleteDatasetSamples(datasetId: string): Promise<void> {
    await db.delete(datasetSamples).where(eq(datasetSamples.datasetId, datasetId));
  }


  async createSampleResult(sampleResult: InsertSampleResult): Promise<SampleResult> {
    const [newSampleResult] = await db.insert(sampleResults).values(sampleResult).returning();
    return newSampleResult;
  }

  // User API Keys operations
  async getUserApiKeys(userId: string, provider?: string): Promise<UserApiKey[]> {
    if (provider) {
      return await db.select().from(userApiKeys)
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
        .orderBy(desc(userApiKeys.createdAt));
    }
    
    return await db.select().from(userApiKeys)
      .where(eq(userApiKeys.userId, userId))
      .orderBy(desc(userApiKeys.createdAt));
  }

  async getUserApiKey(userId: string, provider: string): Promise<UserApiKey | undefined> {
    const [apiKey] = await db.select().from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider), eq(userApiKeys.isActive, true)));
    return apiKey;
  }

  async createUserApiKey(apiKey: InsertUserApiKey): Promise<UserApiKey> {
    const [newApiKey] = await db.insert(userApiKeys).values(apiKey).returning();
    return newApiKey;
  }

  async updateUserApiKey(id: string, apiKey: Partial<InsertUserApiKey>): Promise<UserApiKey> {
    const [updatedApiKey] = await db.update(userApiKeys)
      .set({ ...apiKey, updatedAt: new Date() })
      .where(eq(userApiKeys.id, id))
      .returning();
    return updatedApiKey;
  }

  async deleteUserApiKey(id: string): Promise<void> {
    await db.delete(userApiKeys).where(eq(userApiKeys.id, id));
  }

  // Audit Trail operations
  async getAuditTrail(organizationId: string, limit = 100): Promise<AuditTrail[]> {
    return await db.select().from(auditTrail)
      .where(eq(auditTrail.organizationId, organizationId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit);
  }

  async getAuditTrailEnhanced(organizationId: string, limit = 100): Promise<EnhancedAuditEntry[]> {
    // Get basic audit entries with user information
    const entries = await db.select({
      id: auditTrail.id,
      action: auditTrail.action,
      entityType: auditTrail.entityType,
      entityId: auditTrail.entityId,
      changes: auditTrail.changes,
      organizationId: auditTrail.organizationId,
      userId: auditTrail.userId,
      createdAt: auditTrail.createdAt,
      userName: users.email,
      userFirstName: users.firstName,
      userLastName: users.lastName
    })
    .from(auditTrail)
    .leftJoin(users, eq(auditTrail.userId, users.id))
    .where(eq(auditTrail.organizationId, organizationId))
    .orderBy(desc(auditTrail.createdAt))
    .limit(limit);

    // Group entity IDs by type for batched queries
    const entityGroups: Record<string, string[]> = {};
    entries.forEach(entry => {
      if (!entityGroups[entry.entityType]) {
        entityGroups[entry.entityType] = [];
      }
      if (!entityGroups[entry.entityType].includes(entry.entityId)) {
        entityGroups[entry.entityType].push(entry.entityId);
      }
    });

    // Batch fetch all entities by type
    const entityMaps: Record<string, Record<string, any>> = {};
    
    // Fetch prompts in batch
    if (entityGroups.prompt?.length) {
      const promptResults = await db.select({ id: prompts.id, name: prompts.name })
        .from(prompts)
        .where(inArray(prompts.id, entityGroups.prompt));
      entityMaps.prompt = Object.fromEntries(promptResults.map(p => [p.id, p]));
    }

    // Fetch datasets in batch
    if (entityGroups.dataset?.length) {
      const datasetResults = await db.select({ id: datasets.id, name: datasets.name })
        .from(datasets)
        .where(inArray(datasets.id, entityGroups.dataset));
      entityMaps.dataset = Object.fromEntries(datasetResults.map(d => [d.id, d]));
    }

    // Fetch eval specs in batch
    if (entityGroups.evalSpec?.length) {
      const evalSpecResults = await db.select({ id: evalSpecs.id, name: evalSpecs.name })
        .from(evalSpecs)
        .where(inArray(evalSpecs.id, entityGroups.evalSpec));
      entityMaps.evalSpec = Object.fromEntries(evalSpecResults.map(e => [e.id, e]));
    }

    // Fetch policies in batch
    if (entityGroups.policy?.length) {
      const policyResults = await db.select({ id: policies.id, name: policies.name })
        .from(policies)
        .where(inArray(policies.id, entityGroups.policy));
      entityMaps.policy = Object.fromEntries(policyResults.map(p => [p.id, p]));
    }

    // Fetch flows in batch
    if (entityGroups.flow?.length) {
      const flowResults = await db.select({ id: flows.id, name: flows.name })
        .from(flows)
        .where(inArray(flows.id, entityGroups.flow));
      entityMaps.flow = Object.fromEntries(flowResults.map(f => [f.id, f]));
    }

    // For runs, we need to fetch them and their associated eval specs
    if (entityGroups.run?.length) {
      const runResults = await db.select({ id: runs.id, evalSpecId: runs.evalSpecId })
        .from(runs)
        .where(inArray(runs.id, entityGroups.run));
      
      const evalSpecIds = [...new Set(runResults.map(r => r.evalSpecId))];
      if (evalSpecIds.length > 0) {
        const runEvalSpecResults = await db.select({ id: evalSpecs.id, name: evalSpecs.name })
          .from(evalSpecs)
          .where(inArray(evalSpecs.id, evalSpecIds));
        const evalSpecMap = Object.fromEntries(runEvalSpecResults.map(e => [e.id, e]));
        entityMaps.run = Object.fromEntries(runResults.map(r => [r.id, { evalSpec: evalSpecMap[r.evalSpecId] }]));
      } else {
        entityMaps.run = {};
      }
    }

    // Build enhanced entries
    const enhancedEntries: EnhancedAuditEntry[] = entries.map(entry => {
      let entityName = 'Unknown';
      let description = `${entry.action} ${entry.entityType}`;

      // Get entity name from batched results
      const entity = entityMaps[entry.entityType]?.[entry.entityId];
      
      switch (entry.entityType) {
        case 'prompt':
          entityName = entity?.name || 'Unknown Prompt';
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} prompt "${entityName}"`;
          break;
        case 'dataset':
          entityName = entity?.name || 'Unknown Dataset';
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} dataset "${entityName}"`;
          break;
        case 'evalSpec':
          entityName = entity?.name || 'Unknown Eval Spec';
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} evaluation specification "${entityName}"`;
          break;
        case 'run':
          entityName = entity?.evalSpec?.name || 'Unknown Run';
          description = `${entry.action === 'create' ? 'Started' : entry.action === 'update' ? 'Updated' : 'Deleted'} evaluation run for "${entityName}"`;
          break;
        case 'policy':
          entityName = entity?.name || 'Unknown Policy';
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} policy "${entityName}"`;
          break;
        case 'flow':
          entityName = entity?.name || 'Unknown Flow';
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} flow "${entityName}"`;
          break;
        case 'baseline':
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} baseline`;
          entityName = 'Baseline';
          break;
        default:
          description = `${entry.action === 'create' ? 'Created' : entry.action === 'update' ? 'Updated' : 'Deleted'} ${entry.entityType}`;
      }

      return {
        id: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        changes: entry.changes,
        userId: entry.userId,
        organizationId: entry.organizationId,
        createdAt: entry.createdAt,
        userName: entry.userName,
        userFirstName: entry.userFirstName,
        userLastName: entry.userLastName,
        entityName,
        description
      };
    });

    return enhancedEntries;
  }

  async createAuditEntry(entry: InsertAuditTrail): Promise<AuditTrail> {
    const [newEntry] = await db.insert(auditTrail).values(entry).returning();
    return newEntry;
  }

  // Dashboard/Statistics operations
  async getDashboardStats(organizationId: string): Promise<{
    activeRuns: number;
    passRate: number;
    avgCost: number;
    p95Latency: number;
  }> {
    // Active runs count
    const [activeRunsResult] = await db
      .select({ count: count() })
      .from(runs)
      .where(and(
        eq(runs.organizationId, organizationId),
        eq(runs.status, 'running')
      ));

    // All finished runs in last 30 days for pass rate calculation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const finishedRuns = await db
      .select({ 
        status: runs.status, 
        decision: runs.decision, 
        cost: runs.cost, 
        duration: runs.duration 
      })
      .from(runs)
      .where(and(
        eq(runs.organizationId, organizationId),
        sql`${runs.status} IN ('completed', 'failed')`,
        sql`${runs.completedAt} >= ${thirtyDaysAgo}`
      ));

    const totalRuns = finishedRuns.length;
    const passedRuns = finishedRuns.filter(run => run.decision === 'pass').length;
    const passRate = totalRuns > 0 ? (passedRuns / totalRuns) * 100 : 0;

    // Average cost (only from successful runs)
    const completedRuns = finishedRuns.filter(run => run.status === 'completed');
    const validCosts = completedRuns.filter(run => run.cost !== null).map(run => run.cost!);
    const avgCost = validCosts.length > 0 ? validCosts.reduce((sum, cost) => sum + cost, 0) / validCosts.length : 0;

    // P95 latency (duration in seconds, only from successful runs)
    const validDurations = completedRuns.filter(run => run.duration !== null).map(run => run.duration!);
    validDurations.sort((a, b) => a - b);
    const p95Index = Math.floor(validDurations.length * 0.95);
    const p95Latency = validDurations.length > 0 ? validDurations[p95Index] || 0 : 0;

    return {
      activeRuns: activeRunsResult.count,
      passRate: Math.round(passRate * 10) / 10, // Round to 1 decimal
      avgCost: Math.round(avgCost * 100) / 100, // Round to 2 decimals
      p95Latency: p95Latency, // Already in seconds
    };
  }

  // Enhanced Analytics Methods
  async getAnalyticsTrends(organizationId: string, days: number): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const runsData = await db
      .select({
        date: sql`DATE(${runs.startedAt})`,
        status: runs.status,
        decision: runs.decision,
        cost: runs.cost,
        duration: runs.duration,
        evalSpecId: runs.evalSpecId
      })
      .from(runs)
      .where(and(
        eq(runs.organizationId, organizationId),
        sql`${runs.startedAt} >= ${startDate}`
      ))
      .orderBy(runs.startedAt);

    // Group by date and calculate daily metrics
    const dailyMetrics = new Map();
    
    for (const run of runsData) {
      const dateStr = run.date as string;
      if (!dailyMetrics.has(dateStr)) {
        dailyMetrics.set(dateStr, {
          date: dateStr,
          totalRuns: 0,
          completedRuns: 0,
          failedRuns: 0,
          passedRuns: 0,
          totalCost: 0,
          avgDuration: 0,
          durations: []
        });
      }
      
      const dayData = dailyMetrics.get(dateStr);
      dayData.totalRuns++;
      
      if (run.status === 'completed') {
        dayData.completedRuns++;
        if (run.decision === 'pass') dayData.passedRuns++;
        if (run.cost) dayData.totalCost += run.cost;
        if (run.duration) dayData.durations.push(run.duration);
      } else if (run.status === 'failed') {
        dayData.failedRuns++;
      }
    }

    // Convert to array and calculate final metrics
    const trends = Array.from(dailyMetrics.values()).map(day => ({
      date: day.date,
      totalRuns: day.totalRuns,
      successRate: day.totalRuns > 0 ? Math.round((day.completedRuns / day.totalRuns) * 100) : 0,
      passRate: day.completedRuns > 0 ? Math.round((day.passedRuns / day.completedRuns) * 100) : 0,
      totalCost: Math.round(day.totalCost * 100) / 100,
      avgDuration: day.durations.length > 0 ? Math.round(day.durations.reduce((a: number, b: number) => a + b, 0) / day.durations.length) : 0
    }));

    return trends;
  }

  async getCostBreakdown(organizationId: string, days: number): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get cost breakdown by eval spec
    const costByEvalSpec = await db
      .select({
        evalSpecName: evalSpecs.name,
        totalCost: sql<number>`SUM(COALESCE(${runs.cost}, 0))`,
        avgCost: sql<number>`AVG(COALESCE(${runs.cost}, 0))`,
        runCount: count()
      })
      .from(runs)
      .leftJoin(evalSpecs, eq(runs.evalSpecId, evalSpecs.id))
      .where(and(
        eq(runs.organizationId, organizationId),
        eq(runs.status, 'completed'),
        sql`${runs.startedAt} >= ${startDate}`
      ))
      .groupBy(evalSpecs.id, evalSpecs.name)
      .orderBy(sql`SUM(COALESCE(${runs.cost}, 0)) DESC`);

    // Get cost breakdown by model (from modelConfig)
    const runsByModel = await db
      .select({
        modelConfig: evalSpecs.modelConfig,
        totalCost: sql<number>`SUM(COALESCE(${runs.cost}, 0))`,
        runCount: count()
      })
      .from(runs)
      .leftJoin(evalSpecs, eq(runs.evalSpecId, evalSpecs.id))
      .where(and(
        eq(runs.organizationId, organizationId),
        eq(runs.status, 'completed'),
        sql`${runs.startedAt} >= ${startDate}`
      ))
      .groupBy(evalSpecs.modelConfig);

    const costByModel = runsByModel.map(row => {
      let model = 'unknown';
      try {
        const config = JSON.parse(row.modelConfig as string || '{}');
        model = config.model || 'unknown';
      } catch (e) {
        // ignore
      }
      return {
        model,
        totalCost: Math.round((row.totalCost || 0) * 100) / 100,
        runCount: row.runCount
      };
    });

    return {
      byEvalSpec: costByEvalSpec.map(row => ({
        name: row.evalSpecName || 'Unknown',
        totalCost: Math.round((row.totalCost || 0) * 100) / 100,
        avgCost: Math.round((row.avgCost || 0) * 100) / 100,
        runCount: row.runCount
      })),
      byModel: costByModel
    };
  }

  async getPerformanceComparison(organizationId: string, days: number): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const performanceData = await db
      .select({
        evalSpecId: runs.evalSpecId,
        evalSpecName: evalSpecs.name,
        modelConfig: evalSpecs.modelConfig,
        status: runs.status,
        decision: runs.decision,
        cost: runs.cost,
        duration: runs.duration
      })
      .from(runs)
      .leftJoin(evalSpecs, eq(runs.evalSpecId, evalSpecs.id))
      .where(and(
        eq(runs.organizationId, organizationId),
        sql`${runs.startedAt} >= ${startDate}`
      ));

    // Group by eval spec
    const specComparison = new Map();
    
    for (const run of performanceData) {
      const specId = run.evalSpecId;
      if (!specComparison.has(specId)) {
        let model = 'unknown';
        try {
          const config = JSON.parse(run.modelConfig as string || '{}');
          model = config.model || 'unknown';
        } catch (e) {
          // ignore
        }
        
        specComparison.set(specId, {
          id: specId,
          name: run.evalSpecName || 'Unknown',
          model: model,
          totalRuns: 0,
          completedRuns: 0,
          passedRuns: 0,
          totalCost: 0,
          durations: []
        });
      }
      
      const spec = specComparison.get(specId);
      spec.totalRuns++;
      
      if (run.status === 'completed') {
        spec.completedRuns++;
        if (run.decision === 'pass') spec.passedRuns++;
        if (run.cost) spec.totalCost += run.cost;
        if (run.duration) spec.durations.push(run.duration);
      }
    }

    return Array.from(specComparison.values()).map(spec => ({
      id: spec.id,
      name: spec.name,
      model: spec.model,
      totalRuns: spec.totalRuns,
      successRate: spec.totalRuns > 0 ? Math.round((spec.completedRuns / spec.totalRuns) * 100) : 0,
      passRate: spec.completedRuns > 0 ? Math.round((spec.passedRuns / spec.completedRuns) * 100) : 0,
      avgCost: spec.totalCost > 0 ? Math.round((spec.totalCost / spec.completedRuns) * 100) / 100 : 0,
      avgDuration: spec.durations.length > 0 ? Math.round(spec.durations.reduce((a: number, b: number) => a + b, 0) / spec.durations.length) : 0
    }));
  }

  // CI/CD Integration Methods
  async createCicdIntegration(integration: InsertCicdIntegration): Promise<CicdIntegration> {
    const [result] = await db.insert(cicdIntegrations).values(integration).returning();
    return result;
  }

  async getCicdIntegrations(organizationId: string): Promise<CicdIntegration[]> {
    return db.select().from(cicdIntegrations)
      .where(eq(cicdIntegrations.organizationId, organizationId))
      .orderBy(cicdIntegrations.createdAt);
  }

  async getCicdIntegrationById(id: string): Promise<CicdIntegration | undefined> {
    const [result] = await db.select().from(cicdIntegrations)
      .where(eq(cicdIntegrations.id, id));
    return result;
  }

  async updateCicdIntegration(id: string, updates: Partial<InsertCicdIntegration>): Promise<CicdIntegration> {
    const [result] = await db.update(cicdIntegrations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cicdIntegrations.id, id))
      .returning();
    return result;
  }

  async deleteCicdIntegration(id: string): Promise<void> {
    await db.delete(cicdIntegrations).where(eq(cicdIntegrations.id, id));
  }

  // Webhook Events
  async createWebhookEvent(event: InsertWebhookEvent): Promise<WebhookEvent> {
    const [result] = await db.insert(webhookEvents).values(event).returning();
    return result;
  }

  async getUnprocessedWebhookEvents(organizationId: string): Promise<WebhookEvent[]> {
    return db.select().from(webhookEvents)
      .where(and(
        eq(webhookEvents.organizationId, organizationId),
        eq(webhookEvents.processed, false)
      ))
      .orderBy(webhookEvents.createdAt);
  }

  async markWebhookEventProcessed(id: string, error?: string): Promise<void> {
    await db.update(webhookEvents)
      .set({ 
        processed: true, 
        processedAt: new Date(),
        error: error || null
      })
      .where(eq(webhookEvents.id, id));
  }

  // CI/CD Runs
  async createCicdRun(run: InsertCicdRun): Promise<CicdRun> {
    const [result] = await db.insert(cicdRuns).values(run).returning();
    return result;
  }

  async updateCicdRun(id: string, updates: Partial<InsertCicdRun>): Promise<CicdRun> {
    const [result] = await db.update(cicdRuns)
      .set(updates)
      .where(eq(cicdRuns.id, id))
      .returning();
    return result;
  }

  async getCicdRunsByIntegration(integrationId: string): Promise<CicdRun[]> {
    return db.select().from(cicdRuns)
      .where(eq(cicdRuns.integrationId, integrationId))
      .orderBy(cicdRuns.createdAt);
  }

  // Alert Configuration
  async createAlertConfig(config: InsertAlertConfig): Promise<AlertConfig> {
    const [result] = await db.insert(alertConfigs).values(config).returning();
    return result;
  }

  async getAlertConfigs(organizationId: string): Promise<AlertConfig[]> {
    return db.select().from(alertConfigs)
      .where(eq(alertConfigs.organizationId, organizationId))
      .orderBy(alertConfigs.createdAt);
  }

  async updateAlertConfig(id: string, updates: Partial<InsertAlertConfig>): Promise<AlertConfig> {
    const [result] = await db.update(alertConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(alertConfigs.id, id))
      .returning();
    return result;
  }

  // Alert Events
  async createAlertEvent(event: InsertAlertEvent): Promise<AlertEvent> {
    const [result] = await db.insert(alertEvents).values(event).returning();
    return result;
  }

  async getRecentAlertEvents(organizationId: string, limit: number = 50): Promise<AlertEvent[]> {
    return db.select().from(alertEvents)
      .where(eq(alertEvents.organizationId, organizationId))
      .orderBy(alertEvents.createdAt)
      .limit(limit);
  }

  async acknowledgeAlertEvent(id: string, userId: string): Promise<AlertEvent> {
    const [result] = await db.update(alertEvents)
      .set({ 
        acknowledgedBy: userId, 
        acknowledgedAt: new Date() 
      })
      .where(eq(alertEvents.id, id))
      .returning();
    return result;
  }

  async resolveAlertEvent(id: string, userId: string): Promise<AlertEvent> {
    const [result] = await db.update(alertEvents)
      .set({ 
        resolved: true,
        resolvedBy: userId, 
        resolvedAt: new Date() 
      })
      .where(eq(alertEvents.id, id))
      .returning();
    return result;
  }


  async deleteAlertConfig(id: string): Promise<void> {
    await db.delete(alertConfigs).where(eq(alertConfigs.id, id));
  }

  // CI/CD Run operations (re-added)
  async getCicdRuns(organizationId: string, limit = 50): Promise<CicdRun[]> {
    return await db.select().from(cicdRuns)
      .where(eq(cicdRuns.organizationId, organizationId))
      .orderBy(desc(cicdRuns.createdAt))
      .limit(limit);
  }

  async getCicdRunById(id: string): Promise<CicdRun | undefined> {
    const [run] = await db.select().from(cicdRuns).where(eq(cicdRuns.id, id));
    return run;
  }

  // Webhook Event operations (re-added)
  async getWebhookEvents(organizationId: string, limit = 50): Promise<WebhookEvent[]> {
    return await db.select().from(webhookEvents)
      .where(eq(webhookEvents.organizationId, organizationId))
      .orderBy(desc(webhookEvents.createdAt))
      .limit(limit);
  }

  // AI Provider operations
  async getActiveAIProviders(): Promise<AiProvider[]> {
    return await db.select().from(aiProviders).where(eq(aiProviders.isActive, true));
  }

  async getAIProvider(id: string): Promise<AiProvider | undefined> {
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
    return provider;
  }

  async createAIProvider(data: InsertAiProvider): Promise<AiProvider> {
    const [provider] = await db.insert(aiProviders).values(data).returning();
    return provider;
  }

  async updateAIProviderHealth(id: string, status: string): Promise<void> {
    await db.update(aiProviders)
      .set({ healthStatus: status, lastHealthCheck: new Date() })
      .where(eq(aiProviders.id, id));
  }

  // Model operations
  async getModelByProviderAndName(providerId: string, modelName: string): Promise<Model | undefined> {
    const [model] = await db.select()
      .from(models)
      .where(and(eq(models.providerId, providerId), eq(models.name, modelName)));
    return model;
  }

  async createModel(data: InsertModel): Promise<Model> {
    const [model] = await db.insert(models).values(data).returning();
    return model;
  }

  async getModels(providerId?: string): Promise<Model[]> {
    if (providerId) {
      return await db.select().from(models).where(eq(models.providerId, providerId));
    }
    return await db.select().from(models);
  }

  async getModelById(id: string): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.id, id));
    return model;
  }

  // Model Registry operations
  async getModelVersions(modelId: string): Promise<ModelVersion[]> {
    return await db.select()
      .from(modelVersions)
      .where(eq(modelVersions.modelId, modelId))
      .orderBy(desc(modelVersions.createdAt));
  }

  async createModelVersion(version: InsertModelVersion): Promise<ModelVersion> {
    const [created] = await db.insert(modelVersions).values(version).returning();
    return created;
  }

  async getModelBenchmarks(modelId: string): Promise<ModelBenchmark[]> {
    return await db.select()
      .from(modelBenchmarks)
      .where(eq(modelBenchmarks.modelId, modelId))
      .orderBy(desc(modelBenchmarks.testDate));
  }

  async createModelBenchmark(benchmark: InsertModelBenchmark): Promise<ModelBenchmark> {
    const [created] = await db.insert(modelBenchmarks).values(benchmark).returning();
    return created;
  }

  async getModelComparisons(organizationId: string): Promise<ModelComparison[]> {
    return await db.select()
      .from(modelComparisons)
      .where(eq(modelComparisons.organizationId, organizationId))
      .orderBy(desc(modelComparisons.createdAt));
  }

  async createModelComparison(comparison: InsertModelComparison): Promise<ModelComparison> {
    const [created] = await db.insert(modelComparisons).values(comparison).returning();
    return created;
  }

  async getModelsWithVersions(): Promise<Array<Model & { latestVersion?: ModelVersion }>> {
    const allModels = await db.select().from(models);
    const result = [];
    
    for (const model of allModels) {
      const versions = await this.getModelVersions(model.id);
      const latestVersion = versions.find(v => v.isActive) || versions[0];
      result.push({
        ...model,
        latestVersion,
      });
    }
    
    return result;
  }

  // Organization Provider Config operations
  async getOrganizationProviderConfigs(organizationId: string): Promise<OrganizationProviderConfig[]> {
    return await db.select()
      .from(organizationProviderConfigs)
      .where(eq(organizationProviderConfigs.organizationId, organizationId));
  }

  async getProviderConfig(providerId: string): Promise<OrganizationProviderConfig | undefined> {
    const [config] = await db.select()
      .from(organizationProviderConfigs)
      .where(eq(organizationProviderConfigs.providerId, providerId));
    return config;
  }

  async createOrganizationProviderConfig(data: InsertOrganizationProviderConfig): Promise<OrganizationProviderConfig> {
    const [config] = await db.insert(organizationProviderConfigs).values(data).returning();
    return config;
  }

  // Model Usage operations
  async createModelUsage(data: InsertModelUsage): Promise<ModelUsage> {
    const [usage] = await db.insert(modelUsage).values(data).returning();
    return usage;
  }

  async getModelUsageByOrganization(organizationId: string, startDate?: Date, endDate?: Date): Promise<ModelUsage[]> {
    if (startDate && endDate) {
      return await db.select().from(modelUsage)
        .where(and(
          eq(modelUsage.organizationId, organizationId),
          gte(modelUsage.date, startDate),
          lte(modelUsage.date, endDate)
        ));
    }
    
    return await db.select().from(modelUsage)
      .where(eq(modelUsage.organizationId, organizationId));
  }

  // Provider Health Check operations
  async createProviderHealthCheck(data: InsertProviderHealthCheck): Promise<ProviderHealthCheck> {
    const [check] = await db.insert(providerHealthChecks).values(data).returning();
    return check;
  }

  async getRecentProviderHealthChecks(providerId: string, limit: number = 10): Promise<ProviderHealthCheck[]> {
    return await db.select()
      .from(providerHealthChecks)
      .where(eq(providerHealthChecks.providerId, providerId))
      .orderBy(desc(providerHealthChecks.checkedAt))
      .limit(limit);
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // ============= PERMISSION SYSTEM IMPLEMENTATIONS =============

  // Role operations
  async getRoles(organizationId: string): Promise<Role[]> {
    return await db.select().from(roles)
      .where(eq(roles.organizationId, organizationId))
      .orderBy(desc(roles.priority), roles.name);
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [newRole] = await db.insert(roles).values([role]).returning();
    return newRole;
  }

  async updateRole(id: string, role: Partial<InsertRole>): Promise<Role> {
    const [updatedRole] = await db.update(roles)
      .set(role)
      .where(eq(roles.id, id))
      .returning();
    return updatedRole;
  }

  async deleteRole(id: string): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  // User role operations
  async getUserRoles(userId: string): Promise<Role[]> {
    return await db.select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      organizationId: roles.organizationId,
      isSystemRole: roles.isSystemRole,
      priority: roles.priority,
      createdAt: roles.createdAt,
      updatedAt: roles.updatedAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  }

  async getUsersByRole(roleId: string): Promise<User[]> {
    return await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      role: users.role,
      organizationId: users.organizationId,
      entraId: users.entraId,
      upn: users.upn,
      tenantId: users.tenantId,
      department: users.department,
      jobTitle: users.jobTitle,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(userRoles)
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(eq(userRoles.roleId, roleId));
  }

  async createUserRole(userRole: InsertUserRole): Promise<UserRole> {
    const [newUserRole] = await db.insert(userRoles).values([userRole]).returning();
    return newUserRole;
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await db.delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  // Permission operations
  async getPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions).orderBy(permissions.name);
  }

  async getPermission(id: string): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions).where(eq(permissions.id, id));
    return permission;
  }

  async getPermissionByTypeAndAction(resourceType: string, action: string): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions)
      .where(and(
        eq(permissions.resourceType, resourceType as any),
        eq(permissions.action, action as any)
      ));
    return permission;
  }

  async createPermission(permission: InsertPermission): Promise<Permission> {
    const [newPermission] = await db.insert(permissions).values([permission]).returning();
    return newPermission;
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    // Get permissions through role assignments
    return await db.select({
      id: permissions.id,
      name: permissions.name,
      resourceType: permissions.resourceType,
      action: permissions.action,
      description: permissions.description,
      isSystemPermission: permissions.isSystemPermission,
      createdAt: permissions.createdAt,
    })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    return await db.select({
      id: permissions.id,
      name: permissions.name,
      resourceType: permissions.resourceType,
      action: permissions.action,
      description: permissions.description,
      isSystemPermission: permissions.isSystemPermission,
      createdAt: permissions.createdAt,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  }

  // Role permission operations
  async createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission> {
    const [newRolePermission] = await db.insert(rolePermissions).values([rolePermission]).returning();
    return newRolePermission;
  }

  async removeRolePermission(roleId: string, permissionId: string): Promise<void> {
    await db.delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)));
  }

  // Resource permission operations
  async getResourcePermissions(resourceType: string, resourceId: string): Promise<ResourcePermission[]> {
    return await db.select().from(resourcePermissions)
      .where(and(
        eq(resourcePermissions.resourceType, resourceType as any),
        eq(resourcePermissions.resourceId, resourceId)
      ));
  }

  async getUserResourcePermissions(userId: string): Promise<ResourcePermission[]> {
    return await db.select().from(resourcePermissions)
      .where(eq(resourcePermissions.userId, userId));
  }

  async createResourcePermission(resourcePermission: InsertResourcePermission): Promise<ResourcePermission> {
    const [newResourcePermission] = await db.insert(resourcePermissions).values([resourcePermission]).returning();
    return newResourcePermission;
  }

  async removeResourcePermission(id: string): Promise<void> {
    await db.delete(resourcePermissions).where(eq(resourcePermissions.id, id));
  }

  // Permission audit operations
  async createPermissionAuditLog(auditLog: InsertPermissionAuditLog): Promise<PermissionAuditLog> {
    const [newAuditLog] = await db.insert(permissionAuditLog).values([auditLog]).returning();
    return newAuditLog;
  }

  async getPermissionAuditLogs(organizationId: string, limit = 100): Promise<PermissionAuditLog[]> {
    return await db.select({
      id: permissionAuditLog.id,
      createdAt: permissionAuditLog.createdAt,
      userId: permissionAuditLog.userId,
      action: permissionAuditLog.action,
      roleId: permissionAuditLog.roleId,
      resourceType: permissionAuditLog.resourceType,
      resourceId: permissionAuditLog.resourceId,
      targetUserId: permissionAuditLog.targetUserId,
      permission: permissionAuditLog.permission,
      details: permissionAuditLog.details,
      performedBy: permissionAuditLog.performedBy,
    }).from(permissionAuditLog)
      .innerJoin(users, eq(permissionAuditLog.userId, users.id))
      .where(eq(users.organizationId, organizationId))
      .orderBy(desc(permissionAuditLog.createdAt))
      .limit(limit);
  }

  // Custom Evaluator operations
  async getCustomEvaluators(organizationId: string, filters?: {
    status?: string;
    evaluatorType?: string;
    tags?: string[];
    includePublic?: boolean;
  }): Promise<CustomEvaluator[]> {
    // Build base conditions for additional filters
    const additionalConditions = [];
    
    if (filters?.status) {
      additionalConditions.push(eq(customEvaluators.status, filters.status as any));
    }
    
    if (filters?.evaluatorType) {
      additionalConditions.push(eq(customEvaluators.evaluatorType, filters.evaluatorType));
    }
    
    // Handle tag filtering if specified
    let query = db.select().from(customEvaluators);
    
    if (filters?.includePublic) {
      // Return both organization evaluators AND public evaluators using OR logic
      query = query.where(and(
        or(
          eq(customEvaluators.organizationId, organizationId),
          eq(customEvaluators.isPublic, true)
        ),
        ...additionalConditions
      ));
    } else {
      // Return only organization evaluators
      query = query.where(and(
        eq(customEvaluators.organizationId, organizationId),
        ...additionalConditions
      ));
    }
    
    // Add tag filtering using SQL array operations if specified
    if (filters?.tags && filters.tags.length > 0) {
      // Use SQL raw for array overlap check
      query = query.where(sql`${customEvaluators.tags} && ${filters.tags}`);
    }
    
    return await query.orderBy(desc(customEvaluators.createdAt));
  }

  async getCustomEvaluator(id: string): Promise<CustomEvaluator | undefined> {
    const [evaluator] = await db.select().from(customEvaluators).where(eq(customEvaluators.id, id));
    return evaluator;
  }

  async createCustomEvaluator(evaluator: InsertCustomEvaluator): Promise<CustomEvaluator> {
    const [newEvaluator] = await db.insert(customEvaluators).values([evaluator]).returning();
    return newEvaluator;
  }

  async updateCustomEvaluator(id: string, evaluator: Partial<InsertCustomEvaluator>): Promise<CustomEvaluator> {
    const [updatedEvaluator] = await db.update(customEvaluators)
      .set({
        ...evaluator,
        updatedAt: new Date()
      })
      .where(eq(customEvaluators.id, id))
      .returning();
    return updatedEvaluator;
  }

  async deleteCustomEvaluator(id: string): Promise<void> {
    await db.delete(customEvaluators).where(eq(customEvaluators.id, id));
  }

  async findCustomEvaluatorByHash(fileHash: string): Promise<CustomEvaluator | undefined> {
    const [evaluator] = await db.select().from(customEvaluators).where(eq(customEvaluators.fileHash, fileHash));
    return evaluator;
  }

  // Evaluator Usage operations
  async createEvaluatorUsage(usage: InsertEvaluatorUsage): Promise<EvaluatorUsage> {
    const [newUsage] = await db.insert(evaluatorUsage).values([usage]).returning();
    return newUsage;
  }

  async getEvaluatorActiveUsage(evaluatorId: string): Promise<number> {
    const result = await db.select({ count: count() })
      .from(runs)
      .innerJoin(sampleResults, eq(runs.id, sampleResults.runId))
      .where(and(
        eq(runs.status, 'running'),
        sql`${sampleResults.evaluationResults}::jsonb ? ${evaluatorId}`
      ));
    
    return result[0]?.count || 0;
  }

  async getEvaluatorUsageStats(evaluatorId: string, organizationId: string, days: number): Promise<{
    totalExecutions: number;
    successRate: number;
    avgExecutionTime: number;
    totalCost: number;
    usageOverTime: any[];
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const usageData = await db.select({
      success: evaluatorUsage.success,
      executionTime: evaluatorUsage.executionTime,
      cost: evaluatorUsage.cost,
      usedAt: evaluatorUsage.usedAt,
    })
    .from(evaluatorUsage)
    .where(and(
      eq(evaluatorUsage.evaluatorId, evaluatorId),
      eq(evaluatorUsage.organizationId, organizationId),
      gte(evaluatorUsage.usedAt, since)
    ));

    const totalExecutions = usageData.length;
    const successfulExecutions = usageData.filter(u => u.success).length;
    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;
    
    const avgExecutionTime = usageData.length > 0 
      ? usageData.reduce((sum, u) => sum + (u.executionTime || 0), 0) / usageData.length 
      : 0;
    
    const totalCost = usageData.reduce((sum, u) => sum + Number(u.cost || 0), 0);

    // Group usage by day for charts
    const usageOverTime = usageData.reduce((acc: any[], usage) => {
      const day = usage.usedAt?.toISOString().split('T')[0];
      const existing = acc.find(item => item.date === day);
      if (existing) {
        existing.count++;
        existing.cost += Number(usage.cost || 0);
      } else {
        acc.push({
          date: day,
          count: 1,
          cost: Number(usage.cost || 0)
        });
      }
      return acc;
    }, []);

    return {
      totalExecutions,
      successRate,
      avgExecutionTime,
      totalCost,
      usageOverTime
    };
  }

  // ============= AZURE ML INTEGRATION IMPLEMENTATIONS =============

  // Azure Subscription operations
  async getAzureSubscriptions(userId: string): Promise<AzureSubscription[]> {
    return await db.select().from(azureSubscriptions)
      .where(eq(azureSubscriptions.userId, userId))
      .orderBy(azureSubscriptions.displayName);
  }

  async getAzureSubscription(id: string): Promise<AzureSubscription | undefined> {
    const [subscription] = await db.select().from(azureSubscriptions)
      .where(eq(azureSubscriptions.id, id));
    return subscription;
  }

  async createAzureSubscription(subscription: InsertAzureSubscription): Promise<AzureSubscription> {
    const [newSubscription] = await db.insert(azureSubscriptions)
      .values([subscription])
      .returning();
    return newSubscription;
  }

  async updateAzureSubscription(id: string, subscription: Partial<InsertAzureSubscription>): Promise<AzureSubscription> {
    const [updated] = await db.update(azureSubscriptions)
      .set({ ...subscription, updatedAt: new Date() })
      .where(eq(azureSubscriptions.id, id))
      .returning();
    return updated;
  }

  async deleteAzureSubscription(id: string): Promise<void> {
    await db.delete(azureSubscriptions).where(eq(azureSubscriptions.id, id));
  }

  async findAzureSubscriptionBySubscriptionId(subscriptionId: string, userId: string): Promise<AzureSubscription | undefined> {
    const [subscription] = await db.select().from(azureSubscriptions)
      .where(and(
        eq(azureSubscriptions.subscriptionId, subscriptionId),
        eq(azureSubscriptions.userId, userId)
      ));
    return subscription;
  }

  // Azure ML Workspace operations
  async getAzureMLWorkspaces(subscriptionId: string): Promise<AzureMLWorkspace[]> {
    return await db.select().from(azureMLWorkspaces)
      .where(eq(azureMLWorkspaces.azureSubscriptionId, subscriptionId))
      .orderBy(azureMLWorkspaces.workspaceName);
  }

  async getAzureMLWorkspace(id: string): Promise<AzureMLWorkspace | undefined> {
    const [workspace] = await db.select().from(azureMLWorkspaces)
      .where(eq(azureMLWorkspaces.id, id));
    return workspace;
  }

  async createAzureMLWorkspace(workspace: InsertAzureMLWorkspace): Promise<AzureMLWorkspace> {
    const [newWorkspace] = await db.insert(azureMLWorkspaces)
      .values([workspace])
      .returning();
    return newWorkspace;
  }

  async updateAzureMLWorkspace(id: string, workspace: Partial<InsertAzureMLWorkspace>): Promise<AzureMLWorkspace> {
    const [updated] = await db.update(azureMLWorkspaces)
      .set({ ...workspace, updatedAt: new Date() })
      .where(eq(azureMLWorkspaces.id, id))
      .returning();
    return updated;
  }

  async deleteAzureMLWorkspace(id: string): Promise<void> {
    await db.delete(azureMLWorkspaces).where(eq(azureMLWorkspaces.id, id));
  }

  async getAzureMLWorkspacesByUser(userId: string): Promise<AzureMLWorkspace[]> {
    return await db.select().from(azureMLWorkspaces)
      .innerJoin(azureSubscriptions, eq(azureMLWorkspaces.azureSubscriptionId, azureSubscriptions.id))
      .where(eq(azureSubscriptions.userId, userId))
      .orderBy(azureMLWorkspaces.workspaceName);
  }

  // Azure Deployment operations
  async getAzureDeployments(workspaceId: string): Promise<AzureDeployment[]> {
    return await db.select().from(azureDeployments)
      .where(eq(azureDeployments.azureWorkspaceId, workspaceId))
      .orderBy(azureDeployments.deploymentName);
  }

  async getAzureDeployment(id: string): Promise<AzureDeployment | undefined> {
    const [deployment] = await db.select().from(azureDeployments)
      .where(eq(azureDeployments.id, id));
    return deployment;
  }

  async createAzureDeployment(deployment: InsertAzureDeployment): Promise<AzureDeployment> {
    const [newDeployment] = await db.insert(azureDeployments)
      .values([deployment])
      .returning();
    return newDeployment;
  }

  async updateAzureDeployment(id: string, deployment: Partial<InsertAzureDeployment>): Promise<AzureDeployment> {
    const [updated] = await db.update(azureDeployments)
      .set({ ...deployment, updatedAt: new Date() })
      .where(eq(azureDeployments.id, id))
      .returning();
    return updated;
  }

  async deleteAzureDeployment(id: string): Promise<void> {
    await db.delete(azureDeployments).where(eq(azureDeployments.id, id));
  }

  async getAzureDeploymentsByUser(userId: string): Promise<AzureDeployment[]> {
    return await db.select().from(azureDeployments)
      .innerJoin(azureMLWorkspaces, eq(azureDeployments.azureWorkspaceId, azureMLWorkspaces.id))
      .innerJoin(azureSubscriptions, eq(azureMLWorkspaces.azureSubscriptionId, azureSubscriptions.id))
      .where(eq(azureSubscriptions.userId, userId))
      .orderBy(azureDeployments.deploymentName);
  }

  // Azure Prompt Flow operations
  async getAzurePromptFlows(workspaceId: string): Promise<AzurePromptFlow[]> {
    return await db.select().from(azurePromptFlows)
      .where(eq(azurePromptFlows.azureWorkspaceId, workspaceId))
      .orderBy(azurePromptFlows.flowName);
  }

  async getAzurePromptFlow(id: string): Promise<AzurePromptFlow | undefined> {
    const [flow] = await db.select().from(azurePromptFlows)
      .where(eq(azurePromptFlows.id, id));
    return flow;
  }

  async createAzurePromptFlow(flow: InsertAzurePromptFlow): Promise<AzurePromptFlow> {
    const [newFlow] = await db.insert(azurePromptFlows)
      .values([flow])
      .returning();
    return newFlow;
  }

  async updateAzurePromptFlow(id: string, flow: Partial<InsertAzurePromptFlow>): Promise<AzurePromptFlow> {
    const [updated] = await db.update(azurePromptFlows)
      .set({ ...flow, updatedAt: new Date() })
      .where(eq(azurePromptFlows.id, id))
      .returning();
    return updated;
  }

  async deleteAzurePromptFlow(id: string): Promise<void> {
    await db.delete(azurePromptFlows).where(eq(azurePromptFlows.id, id));
  }

  async getAzurePromptFlowsByUser(userId: string): Promise<AzurePromptFlow[]> {
    return await db.select().from(azurePromptFlows)
      .innerJoin(azureMLWorkspaces, eq(azurePromptFlows.azureWorkspaceId, azureMLWorkspaces.id))
      .innerJoin(azureSubscriptions, eq(azureMLWorkspaces.azureSubscriptionId, azureSubscriptions.id))
      .where(eq(azureSubscriptions.userId, userId))
      .orderBy(azurePromptFlows.flowName);
  }

  // Azure OpenAI Account operations
  async getAzureOpenAIAccounts(subscriptionId: string): Promise<AzureOpenAIAccount[]> {
    return await db.select().from(azureOpenAIAccounts)
      .where(eq(azureOpenAIAccounts.azureSubscriptionId, subscriptionId))
      .orderBy(azureOpenAIAccounts.accountName);
  }

  async getAzureOpenAIAccount(id: string): Promise<AzureOpenAIAccount | undefined> {
    const [account] = await db.select().from(azureOpenAIAccounts)
      .where(eq(azureOpenAIAccounts.id, id));
    return account;
  }

  async createAzureOpenAIAccount(account: InsertAzureOpenAIAccount): Promise<AzureOpenAIAccount> {
    const [newAccount] = await db.insert(azureOpenAIAccounts)
      .values([account])
      .returning();
    return newAccount;
  }

  async updateAzureOpenAIAccount(id: string, account: Partial<InsertAzureOpenAIAccount>): Promise<AzureOpenAIAccount> {
    const [updated] = await db.update(azureOpenAIAccounts)
      .set({ ...account, updatedAt: new Date() })
      .where(eq(azureOpenAIAccounts.id, id))
      .returning();
    return updated;
  }

  async deleteAzureOpenAIAccount(id: string): Promise<void> {
    await db.delete(azureOpenAIAccounts).where(eq(azureOpenAIAccounts.id, id));
  }

  async getAzureOpenAIAccountsByUser(userId: string): Promise<AzureOpenAIAccount[]> {
    return await db.select().from(azureOpenAIAccounts)
      .innerJoin(azureSubscriptions, eq(azureOpenAIAccounts.azureSubscriptionId, azureSubscriptions.id))
      .where(eq(azureSubscriptions.userId, userId))
      .orderBy(azureOpenAIAccounts.accountName);
  }

  // Azure OpenAI Deployment operations
  async getAzureOpenAIDeployments(accountId: string): Promise<AzureOpenAIDeployment[]> {
    return await db.select().from(azureOpenAIDeployments)
      .where(eq(azureOpenAIDeployments.azureOpenAIAccountId, accountId))
      .orderBy(azureOpenAIDeployments.deploymentName);
  }

  async getAzureOpenAIDeployment(id: string): Promise<AzureOpenAIDeployment | undefined> {
    const [deployment] = await db.select().from(azureOpenAIDeployments)
      .where(eq(azureOpenAIDeployments.id, id));
    return deployment;
  }

  async createAzureOpenAIDeployment(deployment: InsertAzureOpenAIDeployment): Promise<AzureOpenAIDeployment> {
    const [newDeployment] = await db.insert(azureOpenAIDeployments)
      .values([deployment])
      .returning();
    return newDeployment;
  }

  async updateAzureOpenAIDeployment(id: string, deployment: Partial<InsertAzureOpenAIDeployment>): Promise<AzureOpenAIDeployment> {
    const [updated] = await db.update(azureOpenAIDeployments)
      .set({ ...deployment, updatedAt: new Date() })
      .where(eq(azureOpenAIDeployments.id, id))
      .returning();
    return updated;
  }

  async deleteAzureOpenAIDeployment(id: string): Promise<void> {
    await db.delete(azureOpenAIDeployments).where(eq(azureOpenAIDeployments.id, id));
  }

  async getAzureOpenAIDeploymentsByUser(userId: string): Promise<AzureOpenAIDeployment[]> {
    return await db.select().from(azureOpenAIDeployments)
      .innerJoin(azureOpenAIAccounts, eq(azureOpenAIDeployments.azureOpenAIAccountId, azureOpenAIAccounts.id))
      .innerJoin(azureSubscriptions, eq(azureOpenAIAccounts.azureSubscriptionId, azureSubscriptions.id))
      .where(eq(azureSubscriptions.userId, userId))
      .orderBy(azureOpenAIDeployments.deploymentName);
  }
}

export const storage = new DatabaseStorage();
