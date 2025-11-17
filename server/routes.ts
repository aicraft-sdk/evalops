import type { Express } from "express";
import { PromptTemplateService } from "./services/promptTemplateService";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { WebSocketServer, WebSocket } from "ws";
import { 
  insertPromptSchema,
  insertFlowSchema,
  insertDatasetSchema,
  insertEvalSpecSchema,
  insertRunSchema,
  insertBaselineSchema,
  insertPolicySchema,
  insertAiProviderSchema,
  insertOrganizationProviderConfigSchema,
  insertModelVersionSchema,
  insertModelBenchmarkSchema,
} from "@shared/schema";
import { evaluationEngine } from "./services/evaluationEngine";
import { policyEngine } from "./services/policyEngine";
import { TemplateEngine, TemplatePatterns } from "./services/templateEngine";
import { AIProviderService } from "./services/aiProviderService";
import { aiSdkService } from "./services/aiSdkService";
import { microsoftAuth } from "./services/microsoftAuth";
import { permissionService } from "./services/permissionService";
import { pythonWorker } from "./services/pythonWorkerService";
import { azureDiscoveryService } from "./services/azureDiscoveryService";
import { z } from "zod";
import crypto from "crypto";

// Error handling utility
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isErrorWithStatus(error: unknown): error is Error & { status?: number } {
  return error instanceof Error;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await storage.getUser(userId);
      
      // Create development user if not exists
      if (!user && process.env.NODE_ENV === 'development') {
        user = await storage.upsertUser({
          id: userId,
          email: 'dev@example.com',
          firstName: 'Demo',
          lastName: 'User',
          organizationId: 'default-org',
          role: 'admin',
          profileImageUrl: null
        });
        
        // Initialize permissions for development organization
        try {
          await permissionService.initializeDefaultRoles('default-org');
          
          // Assign user to Administrator role
          const roles = await storage.getRoles('default-org');
          const adminRole = roles.find(role => role.name === 'Administrator');
          if (adminRole) {
            await permissionService.assignRole(userId, adminRole.id, 'system');
            console.log(`[DEV] Assigned Administrator role to user ${userId}`);
          }
        } catch (error) {
          console.warn('Failed to initialize development permissions:', getErrorMessage(error));
        }
        
        // Seed sample AI providers and models for demo
        await seedDevelopmentData();
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", getErrorMessage(error));
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ============= MICROSOFT ENTRA ID AUTH ROUTES =============
  
  // Microsoft Entra ID login initiation
  app.get('/api/auth/microsoft', (req, res) => {
    if (!microsoftAuth.isConfigured()) {
      return res.status(501).json({ 
        message: 'Microsoft Entra ID not configured. Please contact your administrator.' 
      });
    }

    try {
      const state = `${Date.now()}_${Math.random().toString(36)}`;
      req.session.authState = state;
      const loginUrl = microsoftAuth.getLoginUrl(state);
      res.redirect(loginUrl);
    } catch (error) {
      console.error('Microsoft login error:', getErrorMessage(error));
      res.status(500).json({ message: 'Authentication service error' });
    }
  });

  // Microsoft Entra ID OAuth callback
  app.get('/api/auth/microsoft/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ message: 'Invalid callback parameters' });
      }

      // Verify state parameter to prevent CSRF
      if (req.session.authState !== state) {
        return res.status(400).json({ message: 'Invalid state parameter' });
      }

      // Exchange code for user information
      const entraUser = await microsoftAuth.handleCallback(code as string, state as string);
      
      // Find or create user in database
      let user = await storage.getUser(entraUser.oid);
      
      if (!user) {
        // Create new user from Entra ID information
        user = await storage.upsertUser({
          id: entraUser.oid,
          email: entraUser.email || entraUser.upn,
          firstName: entraUser.given_name || entraUser.name.split(' ')[0],
          lastName: entraUser.family_name || entraUser.name.split(' ').slice(1).join(' '),
          organizationId: entraUser.tid, // Use tenant ID as organization ID
          entraId: entraUser.oid,
          upn: entraUser.upn,
          tenantId: entraUser.tid,
          department: entraUser.department,
          jobTitle: entraUser.jobTitle,
          role: 'viewer', // Default role
          isActive: true,
          lastLoginAt: new Date(),
        });

        // Initialize default roles for the organization
        try {
          await permissionService.initializeDefaultRoles(entraUser.tid);
        } catch (error) {
          console.warn('Failed to initialize default roles:', getErrorMessage(error));
        }
      } else {
        // Update existing user
        await storage.upsertUser({
          ...user,
          lastLoginAt: new Date(),
          isActive: true,
        });
      }

      // Create session
      req.user = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          entra_id: entraUser.oid,
          upn: entraUser.upn,
          tenant_id: entraUser.tid
        }
      };

      // Clear auth state
      delete req.session.authState;

      res.redirect('/');
    } catch (error) {
      console.error('Microsoft callback error:', getErrorMessage(error));
      res.status(500).json({ message: 'Authentication failed' });
    }
  });

  // Microsoft Entra ID logout
  app.get('/api/auth/microsoft/logout', async (req, res) => {
    try {
      const user = req.user as any;
      let logoutUrl = '/';

      if (user?.claims?.entra_id && microsoftAuth.isConfigured()) {
        logoutUrl = await microsoftAuth.logout(user.claims.entra_id);
      }

      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
      });

      res.redirect(logoutUrl);
    } catch (error) {
      console.error('Microsoft logout error:', error);
      res.redirect('/');
    }
  });

  // ============= PYTHON WORKER / OPENAI EVALS INTEGRATION =============
  
  // Check Python worker status
  app.get('/api/python-worker/status', isAuthenticated, async (req, res) => {
    try {
      const isHealthy = await pythonWorker.isHealthy();
      const info = isHealthy ? await pythonWorker.getWorkerInfo() : null;
      
      res.json({
        healthy: isHealthy,
        info: info,
        endpoint: process.env.PYTHON_WORKER_URL || 'http://localhost:5055'
      });
    } catch (error) {
      console.error('Python worker status check failed:', error);
      res.json({
        healthy: false,
        error: getErrorMessage(error),
        endpoint: process.env.PYTHON_WORKER_URL || 'http://localhost:5055'
      });
    }
  });

  // Submit evaluation to Python worker
  app.post('/api/evaluations/advanced', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check permissions
      const hasPermission = await permissionService.hasPermission({
        userId,
        resourceType: 'eval_spec',
        action: 'execute'
      });
      
      if (!hasPermission) {
        return res.status(403).json({ message: "Insufficient permissions to execute evaluations" });
      }

      const { evalSpecId, datasetSamples, modelConfig, evaluationType, gradingCriteria } = req.body;

      // Validate required fields
      if (!evalSpecId || !datasetSamples || !modelConfig || !evaluationType) {
        return res.status(400).json({ 
          message: "Missing required fields: evalSpecId, datasetSamples, modelConfig, evaluationType" 
        });
      }

      // Check if Python worker is available
      const isHealthy = await pythonWorker.isHealthy();
      if (!isHealthy) {
        return res.status(503).json({ 
          message: "Python worker is not available. Please start the Python worker service." 
        });
      }

      // Submit evaluation
      const response = await pythonWorker.submitEvaluation({
        evalSpecId,
        datasetSamples,
        modelConfig,
        evaluationType,
        gradingCriteria
      });

      res.json(response);
    } catch (error) {
      console.error('Advanced evaluation submission failed:', error);
      res.status(500).json({ message: "Failed to submit advanced evaluation" });
    }
  });

  // Get Python evaluation task status
  app.get('/api/evaluations/advanced/:taskId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { taskId } = req.params;

      const taskStatus = await pythonWorker.getTaskStatus(taskId);
      res.json(taskStatus);
    } catch (error) {
      console.error('Failed to get evaluation task status:', error);
      if (error instanceof Error && error.message === 'Task not found') {
        res.status(404).json({ message: "Evaluation task not found" });
      } else {
        res.status(500).json({ message: "Failed to get task status" });
      }
    }
  });

  // List Python worker evaluation tasks
  app.get('/api/evaluations/advanced', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { status, limit } = req.query;
      
      const tasks = await pythonWorker.listTasks(
        status as string | undefined, 
        parseInt(limit as string) || 50
      );
      
      res.json(tasks);
    } catch (error) {
      console.error('Failed to list evaluation tasks:', error);
      res.status(500).json({ message: "Failed to list evaluation tasks" });
    }
  });

  // Enhanced run evaluation with Python worker option
  app.post('/api/runs/advanced', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { evalSpecId, useAdvancedEvals, evaluationType = 'model_graded' } = req.body;

      if (!evalSpecId) {
        return res.status(400).json({ message: "evalSpecId is required" });
      }

      // Get eval spec and dataset
      const evalSpec = await storage.getEvalSpec(evalSpecId);
      if (!evalSpec || evalSpec.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Evaluation spec not found" });
      }

      const dataset = await storage.getDataset(evalSpec.datasetId);
      if (!dataset) {
        return res.status(404).json({ message: "Dataset not found" });
      }

      const datasetSamples = await storage.getDatasetSamples(dataset.id);

      // Create run record
      const runData = {
        name: `Advanced Evaluation - ${evalSpec.name}`,
        evalSpecId: evalSpec.id,
        status: 'running' as const,
        organizationId: user.organizationId,
        triggeredBy: userId,
        description: `Advanced evaluation with ${evaluationType} using Python worker`
      };

      const run = await storage.createRun(runData);

      if (useAdvancedEvals) {
        // Check if Python worker is available
        const isHealthy = await pythonWorker.isHealthy();
        if (!isHealthy) {
          await storage.updateRun(run.id, { 
            status: 'failed',
            errorMessage: 'Python worker is not available' 
          });
          return res.status(503).json({ 
            message: "Python worker is not available. Please start the Python worker service." 
          });
        }

        // Submit to Python worker
        try {
          const pythonTask = await pythonWorker.submitEvaluation({
            evalSpecId: evalSpec.id,
            datasetSamples: datasetSamples.map(sample => ({
              input: typeof sample.input === 'string' ? sample.input : JSON.stringify(sample.input),
              expected_output: typeof sample.expected === 'string' ? sample.expected : JSON.stringify(sample.expected),
              metadata: sample.metadata || {}
            })),
            modelConfig: {
              provider: evalSpec.modelProvider || 'openai',
              model: evalSpec.modelName || 'gpt-4',
              temperature: evalSpec.modelConfig?.temperature || 0.7,
              max_tokens: evalSpec.modelConfig?.maxTokens || 1000
            },
            evaluationType: evaluationType,
            gradingCriteria: evalSpec.evaluators?.[0]?.config
          });

          // Update run with Python task ID
          await storage.updateRun(run.id, { 
            status: 'running',
            description: `Python task ID: ${pythonTask.task_id}`
          });

          res.json({ 
            run, 
            taskId: pythonTask.task_id,
            message: "Advanced evaluation submitted to Python worker" 
          });
        } catch (error) {
          await storage.updateRun(run.id, { 
            status: 'failed',
            errorMessage: `Python worker error: ${error.message}` 
          });
          throw error;
        }
      } else {
        // Fall back to regular evaluation
        res.json({ run, message: "Standard evaluation started" });
        
        // Process with regular evaluation engine in background
        evaluationEngine.executeRun(run, evalSpec, dataset, datasetSamples)
          .catch(error => {
            console.error('Regular evaluation failed:', error);
            storage.updateRun(run.id, { 
              status: 'failed',
              errorMessage: error.message 
            });
          });
      }
    } catch (error) {
      console.error('Advanced run creation failed:', error);
      res.status(500).json({ message: "Failed to create advanced run" });
    }
  });

  // Development data seeding
  async function seedDevelopmentData() {
    try {
      // Create sample AI providers
      const providers = [
        {
          id: 'openai',
          name: 'OpenAI',
          type: 'openai' as const,
          baseUrl: 'https://api.openai.com/v1',
          isActive: true,
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          capabilities: ['text_generation', 'image_analysis', 'function_calling'],
          supportedModels: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
          rateLimits: { requestsPerMinute: 3500, tokensPerMinute: 90000 },
          metadata: {}
        },
        {
          id: 'anthropic',
          name: 'Anthropic',
          type: 'anthropic' as const,
          baseUrl: 'https://api.anthropic.com',
          isActive: true,
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          capabilities: ['text_generation', 'function_calling', 'json_mode'],
          supportedModels: ['claude-3-5-sonnet', 'claude-3-haiku'],
          rateLimits: { requestsPerMinute: 1000, tokensPerMinute: 40000 },
          metadata: {}
        }
      ];

      for (const providerData of providers) {
        const existingProvider = await storage.getAIProvider(providerData.id);
        if (!existingProvider) {
          await storage.createAIProvider(providerData);
        }
      }

      // Create sample models
      const models = [
        {
          id: 'gpt-4-turbo',
          providerId: 'openai',
          name: 'gpt-4-turbo',
          displayName: 'GPT-4 Turbo',
          description: 'Most capable GPT-4 model with vision capabilities',
          capabilities: ['text_generation', 'image_analysis', 'function_calling'],
          contextWindow: 128000,
          maxTokens: 4096,
          inputCostPer1k: 0.01,
          outputCostPer1k: 0.03,
          isActive: true,
          metadata: { vision: true, training_cutoff: '2024-04' }
        },
        {
          id: 'claude-3-5-sonnet',
          providerId: 'anthropic',
          name: 'claude-3-5-sonnet-20241022',
          displayName: 'Claude 3.5 Sonnet',
          description: 'Most intelligent model with improved capabilities',
          capabilities: ['text_generation', 'function_calling', 'json_mode'],
          contextWindow: 200000,
          maxTokens: 8192,
          inputCostPer1k: 0.003,
          outputCostPer1k: 0.015,
          isActive: true,
          metadata: { coding: true, analysis: true }
        }
      ];

      for (const modelData of models) {
        const existingModel = await storage.getModelById(modelData.id);
        if (!existingModel) {
          await storage.createModel(modelData);
          
          // Create sample version for each model
          await storage.createModelVersion({
            id: `${modelData.id}-v1`,
            modelId: modelData.id,
            version: '1.0.0',
            releaseDate: '2024-01-15',
            changeLog: 'Initial release with enhanced capabilities',
            isActive: true,
            isDeprecated: false,
            capabilities: modelData.capabilities,
            contextWindow: modelData.contextWindow,
            maxTokens: modelData.maxTokens,
            inputCostPer1k: modelData.inputCostPer1k,
            outputCostPer1k: modelData.outputCostPer1k,
            benchmarkScores: {
              mmlu: modelData.id.includes('gpt-4') ? 86.4 : 88.7,
              hellaswag: modelData.id.includes('gpt-4') ? 95.3 : 89.0,
              humaneval: modelData.id.includes('gpt-4') ? 88.4 : 92.0
            }
          });

          // Create sample benchmarks
          const benchmarks = [
            {
              id: `${modelData.id}-mmlu`,
              modelId: modelData.id,
              benchmarkName: 'MMLU (Massive Multitask Language Understanding)',
              score: modelData.id.includes('gpt-4') ? 86.4 : 88.7,
              maxScore: 100,
              scoreType: 'accuracy',
              testDate: new Date('2024-01-20').toISOString(),
              testConditions: {
                temperature: 0,
                shots: 5,
                dataset_version: '1.0'
              }
            },
            {
              id: `${modelData.id}-humaneval`,
              modelId: modelData.id,
              benchmarkName: 'HumanEval (Code Generation)',
              score: modelData.id.includes('gpt-4') ? 88.4 : 92.0,
              maxScore: 100,
              scoreType: 'pass_rate',
              testDate: new Date('2024-01-22').toISOString(),
              testConditions: {
                temperature: 0.2,
                num_samples: 100
              }
            }
          ];

          for (const benchmark of benchmarks) {
            await storage.createModelBenchmark(benchmark);
          }
        }
      }
      
      console.log('✅ Development data seeded successfully');
    } catch (error) {
      console.error('Error seeding development data:', error);
    }
  }

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const stats = await storage.getDashboardStats(user.organizationId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Enhanced Analytics Endpoints
  app.get('/api/analytics/trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const trends = await storage.getAnalyticsTrends(user.organizationId, days);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching analytics trends:", error);
      res.status(500).json({ message: "Failed to fetch trends" });
    }
  });

  app.get('/api/analytics/cost-breakdown', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const breakdown = await storage.getCostBreakdown(user.organizationId, days);
      res.json(breakdown);
    } catch (error) {
      console.error("Error fetching cost breakdown:", error);
      res.status(500).json({ message: "Failed to fetch cost breakdown" });
    }
  });

  app.get('/api/analytics/performance-comparison', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const comparison = await storage.getPerformanceComparison(user.organizationId, days);
      res.json(comparison);
    } catch (error) {
      console.error("Error fetching performance comparison:", error);
      res.status(500).json({ message: "Failed to fetch performance comparison" });
    }
  });

  // CI/CD Integration Endpoints
  app.get('/api/cicd/integrations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const integrations = await storage.getCicdIntegrations(user.organizationId);
      res.json(integrations);
    } catch (error) {
      console.error("Error fetching CI/CD integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post('/api/cicd/integrations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const integration = await storage.createCicdIntegration({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: userId,
      });
      res.status(201).json(integration);
    } catch (error) {
      console.error("Error creating CI/CD integration:", error);
      res.status(500).json({ message: "Failed to create integration" });
    }
  });

  app.put('/api/cicd/integrations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const integration = await storage.updateCicdIntegration(req.params.id, req.body);
      res.json(integration);
    } catch (error) {
      console.error("Error updating CI/CD integration:", error);
      res.status(500).json({ message: "Failed to update integration" });
    }
  });

  app.delete('/api/cicd/integrations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteCicdIntegration(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting CI/CD integration:", error);
      res.status(500).json({ message: "Failed to delete integration" });
    }
  });

  // CI/CD Runs Endpoints
  app.get('/api/cicd/runs/:integrationId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const runs = await storage.getCicdRunsByIntegration(req.params.integrationId);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching CI/CD runs:", error);
      res.status(500).json({ message: "Failed to fetch runs" });
    }
  });

  app.post('/api/cicd/runs/:runId/status', isAuthenticated, async (req: any, res) => {
    try {
      const { status, qualityGateResult } = req.body;
      await storage.updateCicdRun(req.params.runId, {
        status,
        qualityGateResult,
        completedAt: status === 'completed' ? new Date() : undefined,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating CI/CD run status:", error);
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Webhook Endpoints (Public - no authentication)
  app.post('/api/webhooks/github/:integrationId', async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      const signature = req.headers['x-hub-signature-256'] as string;
      const event = req.headers['x-github-event'] as string;
      
      // Get integration to verify webhook
      const integration = await storage.getCicdIntegrationById(integrationId);
      if (!integration || !integration.isActive) {
        return res.status(404).json({ message: "Integration not found or inactive" });
      }

      // Verify webhook signature
      const { webhookService } = await import('./services/webhookService');
      if (integration.webhookSecret && signature) {
        const isValid = webhookService.verifyGitHubSignature(
          JSON.stringify(req.body),
          signature,
          integration.webhookSecret
        );
        if (!isValid) {
          return res.status(401).json({ message: "Invalid signature" });
        }
      }

      // Process webhook based on event type
      if (event === 'push') {
        await webhookService.processPushWebhook(
          integrationId,
          req.body,
          integration.organizationId
        );
      } else if (event === 'pull_request') {
        await webhookService.processPullRequestWebhook(
          integrationId,
          req.body,
          integration.organizationId
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing GitHub webhook:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // Generic webhook endpoint for other CI/CD systems
  app.post('/api/webhooks/generic/:integrationId', async (req, res) => {
    try {
      const integrationId = req.params.integrationId;
      
      // Get integration
      const integration = await storage.getCicdIntegrationById(integrationId);
      if (!integration || !integration.isActive) {
        return res.status(404).json({ message: "Integration not found or inactive" });
      }

      // Create webhook event record
      await storage.createWebhookEvent({
        integrationId,
        eventType: req.headers['x-event-type'] as string || 'generic',
        payload: req.body,
        organizationId: integration.organizationId,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing generic webhook:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // Recent runs
  app.get('/api/runs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const runs = await storage.getRuns(user.organizationId, limit);
      
      // Add baseline information to runs
      const runsWithBaselines = await Promise.all(runs.map(async (run) => {
        const baseline = await storage.getActiveBaseline(run.evalSpecId);
        return {
          ...run,
          isBaseline: baseline?.runId === run.id
        };
      }));
      
      res.json(runsWithBaselines);
    } catch (error) {
      console.error("Error fetching runs:", error);
      res.status(500).json({ message: "Failed to fetch runs" });
    }
  });

  // Get detailed run information
  app.get('/api/runs/:id/details', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const runId = req.params.id;
      const run = await storage.getRun(runId);
      
      if (!run || run.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Run not found" });
      }

      // Check if this run is a baseline
      const baseline = await storage.getActiveBaseline(run.evalSpecId);
      const isBaseline = baseline?.runId === run.id;

      // Get sample results for this run
      const sampleResults = await storage.getSampleResults(runId);

      const detailedRun = {
        ...run,
        isBaseline,
        sampleResults
      };

      res.json(detailedRun);
    } catch (error) {
      console.error("Error fetching run details:", error);
      res.status(500).json({ message: "Failed to fetch run details" });
    }
  });

  // Get policy evaluation results for a run
  // Get run sample results
  app.get('/api/runs/:id/samples', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const samples = await storage.getSampleResults(req.params.id);
      res.json(samples);
    } catch (error) {
      console.error("Error fetching sample results:", error);
      res.status(500).json({ message: "Failed to fetch sample results" });
    }
  });

  app.get('/api/runs/:id/policy-results', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const runId = req.params.id;
      const run = await storage.getRun(runId);
      
      if (!run || run.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Run not found" });
      }

      // Get policy violations for this run
      const violations = await storage.getPolicyViolationsByRun(runId);
      
      // Calculate basic policy stats
      const policies = await storage.getPolicies(user.organizationId);
      const activePolicies = policies.filter(p => p.isActive);
      let totalRules = 0;
      
      activePolicies.forEach(policy => {
        const rules = Array.isArray(policy.rules) ? policy.rules : [];
        totalRules += rules.filter((r: any) => r.enabled).length;
      });

      const passedRules = Math.max(0, totalRules - violations.length);
      const score = totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 100;

      const policyResults = {
        decision: run.decision || 'unknown',
        violations: violations.map(v => ({
          message: v.message,
          severity: v.severity,
          policyName: `Policy ${v.policyId.slice(0, 8)}`,
          evidence: v.evidence
        })),
        passedRules,
        totalRules,
        score
      };

      res.json(policyResults);
    } catch (error) {
      console.error("Error fetching policy results:", error);
      res.status(500).json({ message: "Failed to fetch policy results" });
    }
  });

  // Get baseline comparison data for a run
  app.get('/api/runs/:id/baseline-comparison', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const runId = req.params.id;
      const run = await storage.getRun(runId);
      
      if (!run || run.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Run not found" });
      }

      // Get current baseline for this eval spec
      const baseline = await storage.getActiveBaseline(run.evalSpecId);
      
      if (!baseline) {
        return res.json({
          hasBaseline: false,
          message: "No baseline set for this evaluation specification"
        });
      }

      // Get baseline run details
      const baselineRun = await storage.getRun(baseline.runId);
      if (!baselineRun) {
        return res.json({
          hasBaseline: false,
          message: "Baseline run not found"
        });
      }

      // Calculate baseline score (same logic as frontend)
      const baselineMetrics = baselineRun.metrics || {};
      const baselineEvaluatorResults = Object.entries(baselineMetrics).filter(([key]) => 
        !['cost', 'duration', 'latencyP50', 'latencyP95', 'errorRate'].includes(key)
      );
      const baselineScore = baselineEvaluatorResults.length > 0 
        ? baselineEvaluatorResults.reduce((sum, [_, result]: [string, any]) => {
            const mean = result?.mean;
            return sum + (isNaN(mean) || mean === null || mean === undefined ? 0 : mean);
          }, 0) / baselineEvaluatorResults.length 
        : 0;

      const comparison = {
        hasBaseline: true,
        baseline: {
          id: baselineRun.id,
          createdAt: baseline.createdAt,
          description: baseline.description,
          metrics: baselineRun.metrics,
          cost: baselineRun.cost,
          duration: baselineRun.duration,
          decision: baselineRun.decision,
          score: baselineScore
        },
        current: {
          id: run.id,
          createdAt: run.createdAt,
          metrics: run.metrics,
          cost: run.cost,
          duration: run.duration,
          decision: run.decision
        },
        improvements: {
          costChange: baselineRun.cost && run.cost ? ((run.cost - baselineRun.cost) / baselineRun.cost * 100) : null,
          durationChange: baselineRun.duration && run.duration ? ((run.duration - baselineRun.duration) / baselineRun.duration * 100) : null
        }
      };

      res.json(comparison);
    } catch (error) {
      console.error("Error fetching baseline comparison:", error);
      res.status(500).json({ message: "Failed to fetch baseline comparison" });
    }
  });

  // Create run
  app.post('/api/runs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { name, evalSpecId, policyId, description } = req.body;

      if (!name || !evalSpecId || !policyId) {
        return res.status(400).json({ message: "Name, eval spec, and policy are required" });
      }

      const evalSpec = await storage.getEvalSpec(evalSpecId);
      if (!evalSpec) {
        return res.status(404).json({ message: "Eval spec not found" });
      }

      const policy = await storage.getPolicy(policyId);
      if (!policy) {
        return res.status(404).json({ message: "Policy not found" });
      }

      // Create run record
      const runData = {
        name,
        evalSpecId,
        policyId,
        status: 'pending' as const,
        triggeredBy: userId,
        organizationId: user.organizationId,
        description: description || `Manual run of ${evalSpec.name}`,
        commitSha: 'manual-' + Date.now(),
      };

      const run = await storage.createRun(runData);

      // Start evaluation asynchronously
      evaluationEngine.executeRun(run.id).catch(error => {
        console.error(`Failed to execute run ${run.id}:`, error);
      });

      res.status(201).json(run);
    } catch (error) {
      console.error("Error creating run:", error);
      res.status(500).json({ message: "Failed to create run" });
    }
  });

  // Policy violations
  app.get('/api/policy-violations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const violations = await storage.getPolicyViolations(user.organizationId, 10);
      res.json(violations);
    } catch (error) {
      console.error("Error fetching policy violations:", error);
      res.status(500).json({ message: "Failed to fetch policy violations" });
    }
  });

  // Prompts CRUD
  app.get('/api/prompts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const prompts = await storage.getPrompts(user.organizationId);
      res.json(prompts);
    } catch (error) {
      console.error("Error fetching prompts:", error);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  app.post('/api/prompts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { name, content, metadata } = req.body;

      if (!name || !content) {
        return res.status(400).json({ message: "Name and content are required" });
      }

      const { promptService } = await import('./services/promptService');
      const promptId = await promptService.uploadPrompt(
        { name, content, metadata },
        userId,
        user.organizationId
      );

      const prompt = await storage.getPrompt(promptId);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'prompt',
        entityId: prompt!.id,
        action: 'create',
        changes: { name, content },
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json(prompt);
    } catch (error) {
      console.error("Error creating prompt:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create prompt" });
    }
  });

  app.post('/api/prompts/:id/test', isAuthenticated, async (req: any, res) => {
    try {
      const promptId = req.params.id;
      const testInput = req.body;

      const { promptService } = await import('./services/promptService');
      const result = await promptService.testPrompt(promptId, testInput);
      
      res.json(result);
    } catch (error) {
      console.error("Error testing prompt:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to test prompt" });
    }
  });

  app.put('/api/prompts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if prompt exists and belongs to user's organization
      const existingPrompt = await storage.getPrompt(req.params.id);
      if (!existingPrompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      
      if (existingPrompt.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check permissions  
      const hasPermission = await permissionService.hasPermission({
        userId,
        resourceType: 'prompt',
        action: 'write'
      });
      
      console.log(`[DEBUG] Permission check for user ${userId}: resourceType=prompt, action=write, result=${hasPermission}`);
      
      if (!hasPermission) {
        return res.status(403).json({ message: "Insufficient permissions to edit prompts" });
      }

      const { name, content, category, description } = req.body;
      
      // Validate required fields
      if (!name || !content) {
        return res.status(400).json({ message: "Name and content are required" });
      }

      const updatedPrompt = await storage.updatePrompt(req.params.id, {
        name,
        content, 
        category,
        description
      });

      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'prompt',
        entityId: req.params.id,
        action: 'update',
        changes: { name, content, category, description },
        userId,
        organizationId: user.organizationId,
      });

      res.json(updatedPrompt);
    } catch (error) {
      console.error('Error updating prompt:', error);
      res.status(500).json({ message: getErrorMessage(error) });
    }
  });

  app.delete('/api/prompts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const promptId = req.params.id;
      const prompt = await storage.getPrompt(promptId);
      
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Only allow deletion by the author or admin
      if (prompt.authorId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this prompt" });
      }

      await storage.deletePrompt(promptId);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'prompt',
        entityId: promptId,
        action: 'delete',
        changes: { name: prompt.name },
        userId,
        organizationId: user.organizationId,
      });

      res.json({ message: "Prompt deleted successfully" });
    } catch (error) {
      console.error("Error deleting prompt:", error);
      res.status(500).json({ message: "Failed to delete prompt" });
    }
  });

  // Get pre-built judge prompt templates
  app.get('/api/prompt-templates/judge', isAuthenticated, async (req: any, res) => {
    try {
      const templates = PromptTemplateService.getTemplatesByCategory('llm_judge');
      res.json(templates);
    } catch (error) {
      console.error("Error fetching judge templates:", error);
      res.status(500).json({ message: "Failed to fetch judge templates" });
    }
  });

  // Seed pre-built judge prompt templates
  app.post('/api/prompt-templates/seed', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { templateIds } = req.body;
      const allTemplates = PromptTemplateService.getAllTemplates();
      const templatesToSeed = templateIds && templateIds.length > 0 
        ? allTemplates.filter(t => templateIds.includes(t.name))
        : allTemplates;
      
      const seededPrompts = [];

      for (const template of templatesToSeed) {
        // Check if template already exists
        const existingPrompts = await storage.getPrompts(user.organizationId);
        const exists = existingPrompts.some(p => p.name === template.name);
        
        if (!exists) {
          const prompt = await storage.createPrompt({
            name: template.name,
            version: 'v1.0.0',
            content: template.content,
            category: template.category,
            metadata: { 
              description: template.description,
              variables: template.variables,
              isTemplate: true 
            },
            organizationId: user.organizationId,
            createdBy: userId,
          });
          seededPrompts.push(prompt);
        }
      }

      res.json({ 
        message: `Seeded ${seededPrompts.length} judge prompt templates`,
        templates: seededPrompts 
      });
    } catch (error) {
      console.error("Error seeding judge templates:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to seed judge templates" });
    }
  });

  // Flows CRUD
  app.get('/api/flows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const flows = await storage.getFlows(user.organizationId);
      res.json(flows);
    } catch (error) {
      console.error("Error fetching flows:", error);
      res.status(500).json({ message: "Failed to fetch flows" });
    }
  });

  app.post('/api/flows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const flowData = insertFlowSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: userId,
        contentHash: crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex'),
      });

      const flow = await storage.createFlow(flowData);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'flow',
        entityId: flow.id,
        action: 'create',
        changes: flowData,
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json(flow);
    } catch (error) {
      console.error("Error creating flow:", error);
      res.status(500).json({ message: "Failed to create flow" });
    }
  });

  // Datasets CRUD
  app.get('/api/datasets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const datasets = await storage.getDatasets(user.organizationId);
      res.json(datasets);
    } catch (error) {
      console.error("Error fetching datasets:", error);
      res.status(500).json({ message: "Failed to fetch datasets" });
    }
  });

  app.post('/api/datasets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { name, description, samples, schema } = req.body;

      if (!name || !samples || !Array.isArray(samples)) {
        return res.status(400).json({ message: "Name and samples array are required" });
      }

      const { datasetService } = await import('./services/datasetService');
      const datasetId = await datasetService.uploadDataset(
        { name, description, samples, schema },
        userId,
        user.organizationId
      );

      const dataset = await storage.getDataset(datasetId);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'dataset',
        entityId: dataset!.id,
        action: 'create',
        changes: { name, description, sampleCount: samples.length },
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json(dataset);
    } catch (error) {
      console.error("Error creating dataset:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create dataset" });
    }
  });

  app.get('/api/datasets/:id/samples', isAuthenticated, async (req: any, res) => {
    try {
      const datasetId = req.params.id;
      const { datasetService } = await import('./services/datasetService');
      const samples = await datasetService.getDatasetSamples(datasetId);
      res.json(samples);
    } catch (error) {
      console.error("Error fetching dataset samples:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch dataset samples" });
    }
  });

  // Eval Specs CRUD
  app.get('/api/eval-specs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const evalSpecs = await storage.getEvalSpecs(user.organizationId);
      res.json(evalSpecs);
    } catch (error) {
      console.error("Error fetching eval specs:", error);
      res.status(500).json({ message: "Failed to fetch eval specs" });
    }
  });

  app.post('/api/eval-specs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const evalSpecData = insertEvalSpecSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: userId,
      });

      const evalSpec = await storage.createEvalSpec(evalSpecData);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'evalSpec',
        entityId: evalSpec.id,
        action: 'create',
        changes: evalSpecData,
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json(evalSpec);
    } catch (error) {
      console.error("Error creating eval spec:", error);
      res.status(500).json({ message: "Failed to create eval spec" });
    }
  });

  // Run evaluation
  app.post('/api/eval-specs/:id/run', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const evalSpecId = req.params.id;
      const evalSpec = await storage.getEvalSpec(evalSpecId);
      if (!evalSpec) {
        return res.status(404).json({ message: "Eval spec not found" });
      }

      // Create run record
      const runData = {
        name: `Automated Run - ${evalSpec.name}`,
        evalSpecId,
        status: 'pending' as const,
        triggeredBy: userId,
        organizationId: user.organizationId,
        commitSha: req.body.commitSha,
      };

      const run = await storage.createRun(runData);

      // Start evaluation asynchronously
      evaluationEngine.executeRun(run.id).catch(error => {
        console.error(`Failed to execute run ${run.id}:`, error);
      });

      res.status(201).json(run);
    } catch (error) {
      console.error("Error starting evaluation run:", error);
      res.status(500).json({ message: "Failed to start evaluation run" });
    }
  });

  // Policies CRUD
  app.get('/api/policies', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const policies = await storage.getPolicies(user.organizationId);
      res.json(policies);
    } catch (error) {
      console.error("Error fetching policies:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  app.post('/api/policies', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const policyData = insertPolicySchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: userId,
      });

      const policy = await storage.createPolicy(policyData);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'policy',
        entityId: policy.id,
        action: 'create',
        changes: policyData,
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json(policy);
    } catch (error) {
      console.error("Error creating policy:", error);
      res.status(500).json({ message: "Failed to create policy" });
    }
  });

  app.post('/api/policies/default', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { policyEngine } = await import('./services/policyEngine');
      const policies = await policyEngine.createDefaultPolicies(user.organizationId, userId);

      res.status(201).json(policies);
    } catch (error) {
      console.error("Error creating default policies:", error);
      res.status(500).json({ message: "Failed to create default policies" });
    }
  });

  app.post('/api/runs/:id/evaluate-policies', isAuthenticated, async (req: any, res) => {
    try {
      const runId = req.params.id;
      const { policyEngine } = await import('./services/policyEngine');
      
      const result = await policyEngine.evaluateRun(runId);
      res.json(result);
    } catch (error) {
      console.error("Error evaluating policies for run:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to evaluate policies" });
    }
  });

  app.post('/api/runs/:id/set-baseline', isAuthenticated, async (req: any, res) => {
    try {
      const runId = req.params.id;
      const { policyEngine } = await import('./services/policyEngine');
      
      await policyEngine.updateBaseline(runId);
      res.json({ message: "Baseline updated successfully" });
    } catch (error) {
      console.error("Error setting baseline:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to set baseline" });
    }
  });

  // Baselines CRUD
  app.get('/api/baselines', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const baselines = await storage.getBaselines(user.organizationId);
      res.json(baselines);
    } catch (error) {
      console.error("Error fetching baselines:", error);
      res.status(500).json({ message: "Failed to fetch baselines" });
    }
  });

  app.post('/api/baselines', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const baselineData = insertBaselineSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: userId,
      });

      const baseline = await storage.createBaseline(baselineData);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'baseline',
        entityId: baseline.id,
        action: 'create',
        changes: baselineData,
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json(baseline);
    } catch (error) {
      console.error("Error creating baseline:", error);
      res.status(500).json({ message: "Failed to create baseline" });
    }
  });

  // Audit trail
  app.get('/api/audit-trail', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const auditEntries = await storage.getAuditTrailEnhanced(user.organizationId, limit);
      res.json(auditEntries);
    } catch (error) {
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  // CI integration endpoint
  app.get('/api/ci/status/:commitSha/:evalSpecId', async (req, res) => {
    try {
      const { commitSha, evalSpecId } = req.params;
      
      // Find the most recent run for this commit and eval spec
      const runs = await storage.getRunsByEvalSpec(evalSpecId);
      const run = runs.find(r => r.commitSha === commitSha);
      
      if (!run) {
        return res.status(404).json({ 
          status: 'not_found',
          message: 'No run found for the specified commit and eval spec'
        });
      }
      
      if (run.status === 'pending' || run.status === 'running') {
        return res.json({
          status: 'pending',
          message: 'Evaluation is still running'
        });
      }
      
      if (run.status === 'failed') {
        return res.json({
          status: 'error',
          message: run.errorMessage || 'Evaluation failed'
        });
      }
      
      res.json({
        status: run.decision || 'unknown',
        message: `Evaluation completed with ${run.decision} decision`,
        runId: run.id,
        metrics: run.metrics
      });
    } catch (error) {
      console.error("Error checking CI status:", error);
      res.status(500).json({ 
        status: 'error',
        message: "Failed to check evaluation status" 
      });
    }
  });

  // User API Keys management
  app.get('/api/user/api-keys', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const apiKeys = await storage.getUserApiKeys(userId);
      
      // Return only safe data (no encrypted keys)
      const safeApiKeys = apiKeys.map(key => ({
        id: key.id,
        provider: key.provider,
        displayName: key.displayName,
        isActive: key.isActive,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt
      }));
      
      res.json(safeApiKeys);
    } catch (error) {
      console.error("Error fetching user API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  app.post('/api/user/api-keys', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { provider, key, displayName } = req.body;
      
      if (!provider || !key) {
        return res.status(400).json({ message: "Provider and key are required" });
      }

      // Import crypto service
      const { encryptApiKey } = await import("./services/cryptoService");
      
      // Encrypt the API key
      const { encryptedKey, keyHash } = encryptApiKey(key);

      // Deactivate existing keys for this provider
      const existingKeys = await storage.getUserApiKeys(userId, provider);
      for (const existingKey of existingKeys) {
        if (existingKey.isActive) {
          await storage.updateUserApiKey(existingKey.id, { isActive: false });
        }
      }

      // Create new API key
      const newApiKey = await storage.createUserApiKey({
        userId,
        provider,
        encryptedKey,
        keyHash,
        displayName: displayName || `${provider.toUpperCase()} Key`,
        isActive: true
      });

      // Create audit entry
      await storage.createAuditEntry({
        organizationId: user.organizationId,
        userId,
        action: 'api_key_created',
        entity: 'user_api_key',
        entityId: newApiKey.id,
        changes: {
          provider,
          displayName: newApiKey.displayName
        }
      });

      res.json({
        id: newApiKey.id,
        provider: newApiKey.provider,
        displayName: newApiKey.displayName,
        isActive: newApiKey.isActive,
        createdAt: newApiKey.createdAt
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.delete('/api/user/api-keys/:keyId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const keyId = req.params.keyId;
      const apiKeys = await storage.getUserApiKeys(userId);
      const keyToDelete = apiKeys.find(key => key.id === keyId);
      
      if (!keyToDelete) {
        return res.status(404).json({ message: "API key not found" });
      }

      await storage.deleteUserApiKey(keyId);

      // Create audit entry
      await storage.createAuditEntry({
        organizationId: user.organizationId,
        userId,
        action: 'api_key_deleted',
        entity: 'user_api_key',
        entityId: keyId,
        changes: {
          provider: keyToDelete.provider,
          displayName: keyToDelete.displayName
        }
      });

      res.json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  // Template validation endpoints
  app.post('/api/templates/validate', isAuthenticated, async (req: any, res) => {
    try {
      const { template, sampleContext } = req.body;
      
      if (!template) {
        return res.status(400).json({ error: 'Template is required' });
      }

      const variables = TemplateEngine.extractVariables(template);
      const missing = TemplateEngine.validateTemplate(template, sampleContext || {});
      const isValid = TemplateEngine.isValidTemplate(template);
      
      res.json({
        isValid,
        variables,
        missing,
        hasUnresolved: missing.length > 0
      });
    } catch (error) {
      console.error("Error validating template:", error);
      res.status(500).json({ error: "Failed to validate template" });
    }
  });

  app.post('/api/templates/preview', isAuthenticated, async (req: any, res) => {
    try {
      const { template, sampleContext } = req.body;
      
      if (!template) {
        return res.status(400).json({ error: 'Template is required' });
      }

      const preview = TemplateEngine.preview(template, sampleContext);
      
      res.json({
        rendered: preview.rendered,
        variables: preview.variables,
        missing: preview.missing,
        originalTemplate: template
      });
    } catch (error) {
      console.error("Error previewing template:", error);
      res.status(500).json({ error: "Failed to preview template" });
    }
  });

  // Save template endpoint
  app.post('/api/templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { name, description, content } = req.body;

      if (!name || !content) {
        return res.status(400).json({ error: 'Name and content are required' });
      }

      // Validate the template before saving
      const isValid = TemplateEngine.isValidTemplate(content);
      if (!isValid) {
        return res.status(400).json({ error: 'Template content is invalid' });
      }

      // Store directly as a prompt using storage instead of prompt service to bypass validation
      const promptData = {
        name: `[TEMPLATE] ${name}`,
        version: 'v1.0.0',
        content,
        metadata: { 
          isTemplate: true,
          description: description || '',
          variables: TemplateEngine.extractVariables(content)
        },
        organizationId: user.organizationId,
        createdBy: userId,
        contentHash: crypto.createHash('sha256').update(content).digest('hex'),
      };

      const template = await storage.createPrompt(promptData);
      
      // Create audit trail entry
      await storage.createAuditEntry({
        entityType: 'prompt',
        entityId: template.id,
        action: 'create',
        changes: { name, content, description, templateType: 'evaluation' },
        userId,
        organizationId: user.organizationId,
      });

      res.status(201).json({
        id: template.id,
        name: template.name,
        content: template.content,
        description,
        createdAt: template.createdAt,
        createdBy: template.createdBy
      });
    } catch (error) {
      console.error("Error saving template:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save template" });
    }
  });

  app.get('/api/templates/patterns', isAuthenticated, async (req: any, res) => {
    try {
      res.json({
        basicGrader: TemplatePatterns.BASIC_GRADER,
        pushNotificationGrader: TemplatePatterns.PUSH_NOTIFICATION_GRADER,
        factualAccuracyGrader: TemplatePatterns.FACTUAL_ACCURACY_GRADER,
        safetyGrader: TemplatePatterns.SAFETY_GRADER
      });
    } catch (error) {
      console.error("Error fetching template patterns:", error);
      res.status(500).json({ error: "Failed to fetch template patterns" });
    }
  });

  // Alert Configuration Endpoints
  app.get('/api/alerts/configs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const configs = await storage.getAlertConfigs(user.organizationId);
      res.json(configs);
    } catch (error) {
      console.error("Error fetching alert configs:", error);
      res.status(500).json({ message: "Failed to fetch alert configs" });
    }
  });

  app.post('/api/alerts/configs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const config = await storage.createAlertConfig({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: userId,
      });
      res.status(201).json(config);
    } catch (error) {
      console.error("Error creating alert config:", error);
      res.status(500).json({ message: "Failed to create alert config" });
    }
  });

  // Alert Events Endpoints
  app.get('/api/alerts/events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getRecentAlertEvents(user.organizationId, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching alert events:", error);
      res.status(500).json({ message: "Failed to fetch alert events" });
    }
  });

  app.post('/api/alerts/events/:id/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const event = await storage.acknowledgeAlertEvent(req.params.id, userId);
      res.json(event);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  // Azure Discovery endpoints
  const azureDiscoveryRequestSchema = z.object({
    accessToken: z.string().min(1, "Access token is required"),
    tenantId: z.string().min(1, "Tenant ID is required"),
    options: z.object({
      syncWorkspaces: z.boolean().optional().default(true),
      syncDeployments: z.boolean().optional().default(true),
      syncPromptFlows: z.boolean().optional().default(true),
      syncOpenAI: z.boolean().optional().default(true),
      maxConcurrency: z.number().min(1).max(10).optional().default(3)
    }).optional().default({})
  });

  app.post('/api/azure/discover', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const validation = azureDiscoveryRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: validation.error.issues
        });
      }

      const { accessToken, tenantId, options } = validation.data;

      // Extract subscription ID from access token (simplified - in real implementation, would decode JWT)
      // For now, we'll require it to be passed separately or discover it
      const credentials = {
        accessToken,
        tenantId,
        subscriptionId: "" // Will be discovered from Azure API
      };

      // Validate credentials first
      const isValid = await azureDiscoveryService.validateCredentials(credentials);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: "Invalid Azure credentials or insufficient permissions"
        });
      }

      // Start discovery process
      const result = await azureDiscoveryService.discoverUserResources(
        userId,
        credentials,
        options
      );

      res.json({
        success: true,
        data: result,
        message: `Discovery completed: ${result.subscriptions} subscriptions, ${result.workspaces} workspaces, ${result.deployments} deployments, ${result.flows} flows, ${result.openAIAccounts} OpenAI accounts, ${result.openAIDeployments} OpenAI deployments`
      });

    } catch (error) {
      console.error('Azure discovery error:', error);
      res.status(500).json({
        success: false,
        error: "Azure discovery failed",
        details: getErrorMessage(error)
      });
    }
  });

  // AI Provider Management Routes
  app.get('/api/providers', isAuthenticated, async (req: any, res) => {
    try {
      const providers = await storage.getActiveAIProviders();
      res.json(providers);
    } catch (error) {
      console.error('Error fetching providers:', error);
      res.status(500).json({ message: 'Failed to fetch providers' });
    }
  });

  app.post('/api/providers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const validatedData = insertAiProviderSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
      });

      const provider = await storage.createAIProvider(validatedData);
      
      await storage.createAuditEntry({
        organizationId: user.organizationId,
        userId,
        action: 'create',
        entityType: 'provider',
        entityId: provider.id,
        details: { name: provider.name, type: provider.type },
      });

      res.json(provider);
    } catch (error) {
      console.error('Error creating provider:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ message: 'Invalid provider data', details: error.issues });
      } else {
        res.status(500).json({ message: 'Failed to create provider' });
      }
    }
  });

  app.get('/api/providers/:id/config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const config = await storage.getProviderConfig(req.params.id);
      if (!config || config.organizationId !== user.organizationId) {
        return res.status(404).json({ message: 'Provider config not found' });
      }
      
      // Flatten the structure for frontend compatibility
      const credentials = config.credentials as any || {};
      const configData = config.config as any || {};
      
      const flattenedConfig = {
        ...configData, // model, baseUrl, temperature, maxTokens, timeout
        apiKey: credentials.apiKey ? '***' : null, // Mask the API key
        isActive: config.isEnabled,
        priority: config.priority,
      };
      
      res.json(flattenedConfig);
    } catch (error) {
      console.error('Error fetching provider config:', error);
      res.status(500).json({ message: 'Failed to fetch provider config' });
    }
  });

  app.post('/api/providers/:id/config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      // Extract and structure the configuration data
      const { apiKey, isActive, priority, ...configData } = req.body;
      
      const structuredData = {
        organizationId: user.organizationId,
        providerId: req.params.id,
        createdBy: userId,
        isEnabled: isActive !== undefined ? isActive : true,
        priority: priority || 0,
        credentials: apiKey ? { apiKey } : {},
        config: configData, // model, baseUrl, temperature, maxTokens, timeout
      };

      const validatedData = insertOrganizationProviderConfigSchema.parse(structuredData);
      const config = await storage.createOrganizationProviderConfig(validatedData);
      
      // Initialize the provider with AI SDK after saving config
      await aiSdkService.initialize();
      
      await storage.createAuditEntry({
        organizationId: user.organizationId,
        userId,
        action: 'create',
        entityType: 'provider_config',
        entityId: config.id,
        details: { providerId: req.params.id },
      });

      res.json(config);
    } catch (error) {
      console.error('Error creating provider config:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ message: 'Invalid config data', details: error.issues });
      } else {
        res.status(500).json({ message: 'Failed to create provider config' });
      }
    }
  });

  app.get('/api/providers/health', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      await aiSdkService.checkAllProvidersHealth();
      
      // Get health status from database
      const providers = await storage.getActiveAIProviders(user.organizationId);
      const healthData = providers.map(provider => ({
        providerId: provider.id,
        status: provider.healthStatus,
        responseTime: provider.lastHealthCheck ? 100 : 0, // Mock response time
      }));
      
      res.json(healthData);
    } catch (error) {
      console.error('Error checking provider health:', error);
      res.status(500).json({ message: 'Failed to check provider health' });
    }
  });

  app.post('/api/providers/:id/test', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const result = await aiSdkService.testProvider(req.params.id);
      
      // Update health status based on test result
      const healthStatus = result.success ? 'healthy' : 'down';
      await storage.updateAIProviderHealth(req.params.id, healthStatus);
      
      // Log health check
      await storage.createProviderHealthCheck({
        providerId: req.params.id,
        status: healthStatus,
        responseTime: result.latency,
        errorMessage: result.error,
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error testing provider:', error);
      
      // Update status to down on error
      try {
        await storage.updateAIProviderHealth(req.params.id, 'down');
        await storage.createProviderHealthCheck({
          providerId: req.params.id,
          status: 'down',
          responseTime: 0,
          errorMessage: (error as Error).message,
        });
      } catch (healthError) {
        console.error('Failed to update health status:', healthError);
      }
      
      res.status(500).json({ 
        success: false, 
        message: 'Provider test failed',
        error: (error as Error).message 
      });
    }
  });

  // Cost Analytics API Routes
  app.get('/api/analytics/cost-by-provider', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const endDate = new Date();

      const usage = await storage.getModelUsageByOrganization(user.organizationId, startDate, endDate);
      
      // Group by provider
      const providerStats = new Map();
      for (const record of usage) {
        const providerId = record.providerId;
        if (!providerStats.has(providerId)) {
          providerStats.set(providerId, {
            providerId,
            providerName: record.providerName || 'Unknown',
            totalCost: 0,
            totalTokens: 0,
            requestCount: 0,
          });
        }
        
        const stats = providerStats.get(providerId);
        stats.totalCost += record.cost || 0;
        stats.totalTokens += record.inputTokens + record.outputTokens;
        stats.requestCount += record.requestCount;
      }

      const result = Array.from(providerStats.values()).map(stats => ({
        ...stats,
        averageCost: stats.requestCount > 0 ? stats.totalCost / stats.requestCount : 0,
        trend: Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable', // Mock trend for now
      }));

      res.json(result);
    } catch (error) {
      console.error('Error fetching cost by provider:', error);
      res.status(500).json({ message: 'Failed to fetch cost analytics' });
    }
  });

  app.get('/api/analytics/model-usage', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const endDate = new Date();

      const usage = await storage.getModelUsageByOrganization(user.organizationId, startDate, endDate);
      
      // Group by model
      const modelStats = new Map();
      for (const record of usage) {
        const modelId = record.modelId;
        if (!modelStats.has(modelId)) {
          modelStats.set(modelId, {
            modelId,
            modelName: record.modelName || 'Unknown Model',
            provider: record.providerName || 'Unknown',
            cost: 0,
            tokens: 0,
            requests: 0,
          });
        }
        
        const stats = modelStats.get(modelId);
        stats.cost += record.cost || 0;
        stats.tokens += record.inputTokens + record.outputTokens;
        stats.requests += record.requestCount;
      }

      const result = Array.from(modelStats.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 20); // Top 20 models

      res.json(result);
    } catch (error) {
      console.error('Error fetching model usage:', error);
      res.status(500).json({ message: 'Failed to fetch model usage' });
    }
  });

  app.get('/api/analytics/cost-trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const endDate = new Date();

      const usage = await storage.getModelUsageByOrganization(user.organizationId, startDate, endDate);
      
      // Group by date
      const dailyStats = new Map();
      for (const record of usage) {
        const dateKey = record.date.toISOString().split('T')[0];
        if (!dailyStats.has(dateKey)) {
          dailyStats.set(dateKey, {
            date: dateKey,
            cost: 0,
          });
        }
        
        const stats = dailyStats.get(dateKey);
        stats.cost += record.cost || 0;
      }

      const result = Array.from(dailyStats.values())
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(result);
    } catch (error) {
      console.error('Error fetching cost trends:', error);
      res.status(500).json({ message: 'Failed to fetch cost trends' });
    }
  });

  // Model Registry API Routes
  app.get('/api/models', isAuthenticated, async (req: any, res) => {
    try {
      const models = await storage.getModelsWithVersions();
      res.json(models);
    } catch (error) {
      console.error('Error fetching models:', error);
      res.status(500).json({ message: 'Failed to fetch models' });
    }
  });

  app.get('/api/models/:id', isAuthenticated, async (req: any, res) => {
    try {
      const model = await storage.getModelById(req.params.id);
      if (!model) {
        return res.status(404).json({ message: 'Model not found' });
      }
      res.json(model);
    } catch (error) {
      console.error('Error fetching model:', error);
      res.status(500).json({ message: 'Failed to fetch model' });
    }
  });

  app.get('/api/models/:id/versions', isAuthenticated, async (req: any, res) => {
    try {
      const versions = await storage.getModelVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      console.error('Error fetching model versions:', error);
      res.status(500).json({ message: 'Failed to fetch model versions' });
    }
  });

  app.get('/api/models/:id/benchmarks', isAuthenticated, async (req: any, res) => {
    try {
      const benchmarks = await storage.getModelBenchmarks(req.params.id);
      res.json(benchmarks);
    } catch (error) {
      console.error('Error fetching model benchmarks:', error);
      res.status(500).json({ message: 'Failed to fetch model benchmarks' });
    }
  });

  app.post('/api/models/:id/versions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const validatedData = insertModelVersionSchema.parse({
        ...req.body,
        modelId: req.params.id,
      });

      const version = await storage.createModelVersion(validatedData);
      
      await storage.createAuditEntry({
        organizationId: user.organizationId,
        userId,
        action: 'create',
        entityType: 'model_version',
        entityId: version.id,
        details: { modelId: req.params.id, version: version.version },
      });

      res.json(version);
    } catch (error) {
      console.error('Error creating model version:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ message: 'Invalid version data', details: error.issues });
      } else {
        res.status(500).json({ message: 'Failed to create model version' });
      }
    }
  });

  app.post('/api/models/:id/benchmarks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const validatedData = insertModelBenchmarkSchema.parse({
        ...req.body,
        modelId: req.params.id,
      });

      const benchmark = await storage.createModelBenchmark(validatedData);
      
      await storage.createAuditEntry({
        organizationId: user.organizationId,
        userId,
        action: 'create',
        entityType: 'model_benchmark',
        entityId: benchmark.id,
        details: { modelId: req.params.id, benchmarkName: benchmark.benchmarkName },
      });

      res.json(benchmark);
    } catch (error) {
      console.error('Error creating model benchmark:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ message: 'Invalid benchmark data', details: error.issues });
      } else {
        res.status(500).json({ message: 'Failed to create model benchmark' });
      }
    }
  });

  const httpServer = createServer(app);

  // WebSocket Server for Real-time Updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store active connections by organization
  const connectionsByOrg = new Map<string, Set<WebSocket>>();
  
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('WebSocket connection established');
    
    // Extract organization ID from query params
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const orgId = url.searchParams.get('orgId');
    
    if (orgId) {
      if (!connectionsByOrg.has(orgId)) {
        connectionsByOrg.set(orgId, new Set());
      }
      connectionsByOrg.get(orgId)!.add(ws);
    }
    
    // Handle WebSocket messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'subscribe') {
          ws.send(JSON.stringify({
            type: 'subscribed',
            channel: data.channel
          }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      if (orgId) {
        connectionsByOrg.get(orgId)?.delete(ws);
        if (connectionsByOrg.get(orgId)?.size === 0) {
          connectionsByOrg.delete(orgId);
        }
      }
    });
    
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString()
    }));
  });

  // Store broadcast function for real-time updates
  (app as any).broadcastToOrg = (orgId: string, message: any) => {
    const connections = connectionsByOrg.get(orgId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      });
    }
  };

  return httpServer;
}
