import {
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
  type AiProvider,
  type InsertAiProvider,
  type Model,
  type InsertModel,
  type OrganizationProviderConfig,
  type InsertOrganizationProviderConfig,
  type ModelUsage,
  type InsertModelUsage,
  type ProviderHealthCheck,
  type InsertProviderHealthCheck,
  type ModelVersion,
  type InsertModelVersion,
  type ModelBenchmark,
  type InsertModelBenchmark,
  type ModelComparison,
  type InsertModelComparison,
  type CustomEvaluator,
  type InsertCustomEvaluator,
  type EvaluatorVersion,
  type InsertEvaluatorVersion,
  type EvaluatorUsage,
  type InsertEvaluatorUsage,
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
} from "@evalops/shared-db";

export interface IStorage {
  // User operations
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

  // Permission System operations
  getRoles(organizationId: string): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  
  getUserRoles(userId: string): Promise<Role[]>;
  getUsersByRole(roleId: string): Promise<User[]>;
  createUserRole(userRole: InsertUserRole): Promise<UserRole>;
  removeUserRole(userId: string, roleId: string): Promise<void>;
  
  getPermissions(): Promise<Permission[]>;
  getPermission(id: string): Promise<Permission | undefined>;
  getPermissionByTypeAndAction(resourceType: string, action: string): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  getUserPermissions(userId: string): Promise<Permission[]>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
  
  createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission>;
  removeRolePermission(roleId: string, permissionId: string): Promise<void>;
  
  getResourcePermissions(resourceType: string, resourceId: string): Promise<ResourcePermission[]>;
  getUserResourcePermissions(userId: string): Promise<ResourcePermission[]>;
  createResourcePermission(resourcePermission: InsertResourcePermission): Promise<ResourcePermission>;
  removeResourcePermission(id: string): Promise<void>;
  
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

  // Azure ML Integration operations
  getAzureSubscriptions(userId: string): Promise<AzureSubscription[]>;
  getAzureSubscription(id: string): Promise<AzureSubscription | undefined>;
  createAzureSubscription(subscription: InsertAzureSubscription): Promise<AzureSubscription>;
  updateAzureSubscription(id: string, subscription: Partial<InsertAzureSubscription>): Promise<AzureSubscription>;
  deleteAzureSubscription(id: string): Promise<void>;
  findAzureSubscriptionBySubscriptionId(subscriptionId: string, userId: string): Promise<AzureSubscription | undefined>;

  getAzureMLWorkspaces(subscriptionId: string): Promise<AzureMLWorkspace[]>;
  getAzureMLWorkspace(id: string): Promise<AzureMLWorkspace | undefined>;
  createAzureMLWorkspace(workspace: InsertAzureMLWorkspace): Promise<AzureMLWorkspace>;
  updateAzureMLWorkspace(id: string, workspace: Partial<InsertAzureMLWorkspace>): Promise<AzureMLWorkspace>;
  deleteAzureMLWorkspace(id: string): Promise<void>;
  getAzureMLWorkspacesByUser(userId: string): Promise<AzureMLWorkspace[]>;

  getAzureDeployments(workspaceId: string): Promise<AzureDeployment[]>;
  getAzureDeployment(id: string): Promise<AzureDeployment | undefined>;
  createAzureDeployment(deployment: InsertAzureDeployment): Promise<AzureDeployment>;
  updateAzureDeployment(id: string, deployment: Partial<InsertAzureDeployment>): Promise<AzureDeployment>;
  deleteAzureDeployment(id: string): Promise<void>;
  getAzureDeploymentsByUser(userId: string): Promise<AzureDeployment[]>;

  getAzurePromptFlows(workspaceId: string): Promise<AzurePromptFlow[]>;
  getAzurePromptFlow(id: string): Promise<AzurePromptFlow | undefined>;
  createAzurePromptFlow(flow: InsertAzurePromptFlow): Promise<AzurePromptFlow>;
  updateAzurePromptFlow(id: string, flow: Partial<InsertAzurePromptFlow>): Promise<AzurePromptFlow>;
  deleteAzurePromptFlow(id: string): Promise<void>;
  getAzurePromptFlowsByUser(userId: string): Promise<AzurePromptFlow[]>;

  getAzureOpenAIAccounts(subscriptionId: string): Promise<AzureOpenAIAccount[]>;
  getAzureOpenAIAccount(id: string): Promise<AzureOpenAIAccount | undefined>;
  createAzureOpenAIAccount(account: InsertAzureOpenAIAccount): Promise<AzureOpenAIAccount>;
  updateAzureOpenAIAccount(id: string, account: Partial<InsertAzureOpenAIAccount>): Promise<AzureOpenAIAccount>;
  deleteAzureOpenAIAccount(id: string): Promise<void>;
  getAzureOpenAIAccountsByUser(userId: string): Promise<AzureOpenAIAccount[]>;

  getAzureOpenAIDeployments(accountId: string): Promise<AzureOpenAIDeployment[]>;
  getAzureOpenAIDeployment(id: string): Promise<AzureOpenAIDeployment | undefined>;
  createAzureOpenAIDeployment(deployment: InsertAzureOpenAIDeployment): Promise<AzureOpenAIDeployment>;
  updateAzureOpenAIDeployment(id: string, deployment: Partial<InsertAzureOpenAIDeployment>): Promise<AzureOpenAIDeployment>;
  deleteAzureOpenAIDeployment(id: string): Promise<void>;
  getAzureOpenAIDeploymentsByUser(userId: string): Promise<AzureOpenAIDeployment[]>;
}
