import { Injectable } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  prompts,
  flows,
  datasets,
  datasetSamples,
  evalSpecs,
  aiProviders,
  models,
  agents,
  agentVersions,
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
  type AiProvider,
  type InsertAiProvider,
  type Model,
  type InsertModel,
  type Agent,
  type InsertAgent,
  type AgentVersion,
  type InsertAgentVersion,
} from '@evalops/shared-db';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

@Injectable()
export class DatabaseStorageService {
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Prompt operations
  async getPrompts(organizationId: string): Promise<Prompt[]> {
    return await db
      .select()
      .from(prompts)
      .where(eq(prompts.organizationId, organizationId))
      .orderBy(desc(prompts.createdAt));
  }

  async getPrompt(id: string): Promise<Prompt | undefined> {
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
    return prompt;
  }

  async createPrompt(prompt: InsertPrompt): Promise<Prompt> {
    const contentHash = this.generateContentHash(prompt.content);
    const [newPrompt] = await db
      .insert(prompts)
      .values([{ ...prompt, contentHash }])
      .returning();
    return newPrompt;
  }

  async updatePrompt(id: string, prompt: Partial<InsertPrompt>): Promise<Prompt> {
    const [updatedPrompt] = await db
      .update(prompts)
      .set(prompt)
      .where(eq(prompts.id, id))
      .returning();
    return updatedPrompt;
  }

  async deletePrompt(id: string): Promise<void> {
    await db.delete(prompts).where(eq(prompts.id, id));
  }

  async findPromptByContentHash(contentHash: string): Promise<Prompt | undefined> {
    const [prompt] = await db
      .select()
      .from(prompts)
      .where(eq(prompts.contentHash, contentHash));
    return prompt;
  }

  // Flow operations
  async getFlows(organizationId: string): Promise<Flow[]> {
    return await db
      .select()
      .from(flows)
      .where(eq(flows.organizationId, organizationId))
      .orderBy(desc(flows.createdAt));
  }

  async getFlow(id: string): Promise<Flow | undefined> {
    const [flow] = await db.select().from(flows).where(eq(flows.id, id));
    return flow;
  }

  async createFlow(flow: InsertFlow): Promise<Flow> {
    const contentHash = this.generateContentHash(JSON.stringify(flow));
    const [newFlow] = await db
      .insert(flows)
      .values([{ ...flow, contentHash }])
      .returning();
    return newFlow;
  }

  async updateFlow(id: string, flow: Partial<InsertFlow>): Promise<Flow> {
    const [updatedFlow] = await db
      .update(flows)
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
    return await db
      .select()
      .from(datasets)
      .where(eq(datasets.organizationId, organizationId))
      .orderBy(desc(datasets.createdAt));
  }

  async getDataset(id: string): Promise<Dataset | undefined> {
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id));
    return dataset;
  }

  async createDataset(dataset: InsertDataset): Promise<Dataset> {
    const contentHash = this.generateContentHash(JSON.stringify(dataset));
    const [newDataset] = await db
      .insert(datasets)
      .values([{ ...dataset, contentHash }])
      .returning();
    return newDataset;
  }

  async updateDataset(id: string, dataset: Partial<InsertDataset>): Promise<Dataset> {
    const [updatedDataset] = await db
      .update(datasets)
      .set(dataset)
      .where(eq(datasets.id, id))
      .returning();
    return updatedDataset;
  }

  async deleteDataset(id: string): Promise<void> {
    await db.delete(datasets).where(eq(datasets.id, id));
  }

  async findDatasetByContentHash(contentHash: string): Promise<Dataset | undefined> {
    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.contentHash, contentHash));
    return dataset;
  }

  // Dataset samples operations
  async getDatasetSamples(datasetId: string): Promise<DatasetSample[]> {
    return await db
      .select()
      .from(datasetSamples)
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

  // EvalSpec operations
  async getEvalSpecs(organizationId: string): Promise<EvalSpec[]> {
    return await db
      .select()
      .from(evalSpecs)
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
    const [updatedEvalSpec] = await db
      .update(evalSpecs)
      .set(evalSpec)
      .where(eq(evalSpecs.id, id))
      .returning();
    return updatedEvalSpec;
  }

  async deleteEvalSpec(id: string): Promise<void> {
    await db.delete(evalSpecs).where(eq(evalSpecs.id, id));
  }

  // AI Provider operations
  async getProviders(): Promise<AiProvider[]> {
    return await db
      .select()
      .from(aiProviders)
      .orderBy(aiProviders.name);
  }

  async getProvider(id: string): Promise<AiProvider | undefined> {
    const [provider] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id));
    return provider;
  }

  async createProvider(provider: InsertAiProvider): Promise<AiProvider> {
    const [newProvider] = await db
      .insert(aiProviders)
      .values([provider])
      .returning();
    return newProvider;
  }

  async updateProvider(
    id: string,
    provider: Partial<InsertAiProvider>,
  ): Promise<AiProvider> {
    const [updatedProvider] = await db
      .update(aiProviders)
      .set({ ...provider })
      .where(eq(aiProviders.id, id))
      .returning();
    return updatedProvider;
  }

  async deleteProvider(id: string): Promise<void> {
    await db.delete(aiProviders).where(eq(aiProviders.id, id));
  }

  // Model operations
  async getModels(providerId?: string): Promise<Model[]> {
    if (providerId) {
      return await db
        .select()
        .from(models)
        .where(eq(models.providerId, providerId))
        .orderBy(models.name);
    }
    return await db.select().from(models).orderBy(models.name);
  }

  async getModel(id: string): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.id, id));
    return model;
  }

  async createModel(model: InsertModel): Promise<Model> {
    const [newModel] = await db.insert(models).values([model]).returning();
    return newModel;
  }

  async updateModel(id: string, model: Partial<InsertModel>): Promise<Model> {
    const [updatedModel] = await db
      .update(models)
      .set({ ...model })
      .where(eq(models.id, id))
      .returning();
    return updatedModel;
  }

  async deleteModel(id: string): Promise<void> {
    await db.delete(models).where(eq(models.id, id));
  }

  // Agent operations
  async createAgent(agent: InsertAgent): Promise<Agent> {
    const [newAgent] = await db.insert(agents).values([agent]).returning();
    return newAgent;
  }

  async findAgents(organizationId: string, activeOnly = true): Promise<Agent[]> {
    const conditions = activeOnly
      ? and(eq(agents.organizationId, organizationId), eq(agents.active, true))
      : eq(agents.organizationId, organizationId);
    return db.select().from(agents).where(conditions).orderBy(desc(agents.createdAt));
  }

  async findAgentById(id: string, organizationId: string): Promise<Agent | undefined> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.organizationId, organizationId)));
    return agent;
  }

  async updateAgent(
    id: string,
    organizationId: string,
    updates: Partial<InsertAgent>,
  ): Promise<void> {
    await db
      .update(agents)
      .set({ ...updates })
      .where(and(eq(agents.id, id), eq(agents.organizationId, organizationId)));
  }

  // AgentVersion operations
  async createAgentVersion(version: InsertAgentVersion): Promise<void> {
    await db.insert(agentVersions).values([version]);
  }

  async findAgentVersions(
    agentId: string,
    organizationId: string,
  ): Promise<AgentVersion[]> {
    return db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.agentId, agentId),
          eq(agentVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(agentVersions.createdAt));
  }
}

