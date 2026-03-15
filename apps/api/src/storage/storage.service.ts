// This is the abstract class that defines the storage contract
// The actual implementation is in database-storage.service.ts
import { IStorage } from './storage.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class StorageService implements IStorage {
  // User operations
  abstract getUser(id: string): Promise<any>;
  abstract upsertUser(user: any): Promise<any>;
  
  // Organization operations
  abstract getOrganization(id: string): Promise<any>;
  abstract createOrganization(organization: any): Promise<any>;
  
  // Prompt operations
  abstract getPrompts(organizationId: string): Promise<any[]>;
  abstract getPrompt(id: string): Promise<any>;
  abstract createPrompt(prompt: any): Promise<any>;
  abstract updatePrompt(id: string, prompt: Partial<any>): Promise<any>;
  abstract deletePrompt(id: string): Promise<void>;
  
  // Flow operations
  abstract getFlows(organizationId: string): Promise<any[]>;
  abstract getFlow(id: string): Promise<any>;
  abstract createFlow(flow: any): Promise<any>;
  abstract updateFlow(id: string, flow: Partial<any>): Promise<any>;
  abstract deleteFlow(id: string): Promise<void>;
  
  // Dataset operations
  abstract getDatasets(organizationId: string): Promise<any[]>;
  abstract getDataset(id: string): Promise<any>;
  abstract createDataset(dataset: any): Promise<any>;
  abstract updateDataset(id: string, dataset: Partial<any>): Promise<any>;
  abstract deleteDataset(id: string): Promise<void>;
  abstract findDatasetByContentHash(contentHash: string): Promise<any>;
  
  // Dataset samples operations
  abstract getDatasetSamples(datasetId: string): Promise<any[]>;
  abstract createDatasetSample(sample: any): Promise<any>;
  abstract createDatasetSamples(samples: any[]): Promise<any[]>;
  abstract deleteDatasetSamples(datasetId: string): Promise<void>;
  
  // EvalSpec operations
  abstract getEvalSpecs(organizationId: string): Promise<any[]>;
  abstract getEvalSpec(id: string): Promise<any>;
  abstract createEvalSpec(evalSpec: any): Promise<any>;
  abstract updateEvalSpec(id: string, evalSpec: Partial<any>): Promise<any>;
  abstract deleteEvalSpec(id: string): Promise<void>;
  
  // Run operations
  abstract getRuns(organizationId: string, limit?: number): Promise<any[]>;
  abstract getRun(id: string): Promise<any>;
  abstract createRun(run: any): Promise<any>;
  abstract updateRun(id: string, run: Partial<any>): Promise<any>;
  abstract getRunsByEvalSpec(evalSpecId: string): Promise<any[]>;
  
  // Baseline operations
  abstract getBaselines(organizationId: string): Promise<any[]>;
  abstract getBaseline(id: string): Promise<any>;
  abstract createBaseline(baseline: any): Promise<any>;
  abstract updateBaseline(id: string, baseline: Partial<any>): Promise<any>;
  abstract getActiveBaseline(evalSpecId: string): Promise<any>;
  
  // Policy operations
  abstract getPolicies(organizationId: string): Promise<any[]>;
  abstract getPolicy(id: string): Promise<any>;
  abstract createPolicy(policy: any): Promise<any>;
  abstract updatePolicy(id: string, policy: Partial<any>): Promise<any>;
  abstract deletePolicy(id: string): Promise<void>;
  abstract getActivePolicies(organizationId: string): Promise<any[]>;
  
  // Policy Violation operations
  abstract getPolicyViolations(organizationId: string, limit?: number): Promise<any[]>;
  abstract createPolicyViolation(violation: any): Promise<any>;
  abstract getPolicyViolationsByRun(runId: string): Promise<any[]>;
  
  // Sample Results operations
  abstract getSampleResults(runId: string): Promise<any[]>;
  abstract createSampleResult(sampleResult: any): Promise<any>;
  
  // User API Keys operations
  abstract getUserApiKeys(userId: string, provider?: string): Promise<any[]>;
  abstract getUserApiKey(userId: string, provider: string): Promise<any>;
  abstract createUserApiKey(apiKey: any): Promise<any>;
  abstract updateUserApiKey(id: string, apiKey: Partial<any>): Promise<any>;
  abstract deleteUserApiKey(id: string): Promise<void>;
  
  // Audit Trail operations
  abstract getAuditTrail(organizationId: string, limit?: number): Promise<any[]>;
  abstract getAuditTrailEnhanced(organizationId: string, limit?: number): Promise<any[]>;
  abstract createAuditEntry(entry: any): Promise<any>;
  
  // Dashboard/Statistics operations
  abstract getDashboardStats(organizationId: string): Promise<{
    activeRuns: number;
    passRate: number;
    avgCost: number;
    p95Latency: number;
  }>;
  
  // Add other methods as needed - this is a simplified version
  // The full interface from server/storage.ts should be implemented
}

