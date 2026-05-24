import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { datasets, datasetSamples } from '../schema';
import { eq, desc } from 'drizzle-orm';
import * as crypto from 'crypto';

@Injectable()
export class DatasetsRepository {
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async findAllByOrg(
    organizationId: string,
  ): Promise<(typeof datasets.$inferSelect)[]> {
    return db
      .select()
      .from(datasets)
      .where(eq(datasets.organizationId, organizationId))
      .orderBy(desc(datasets.createdAt));
  }

  async findById(
    id: string,
  ): Promise<typeof datasets.$inferSelect | undefined> {
    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, id));
    return dataset;
  }

  async findByContentHash(
    contentHash: string,
  ): Promise<typeof datasets.$inferSelect | undefined> {
    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.contentHash, contentHash));
    return dataset;
  }

  async create(
    data: typeof datasets.$inferInsert,
  ): Promise<typeof datasets.$inferSelect> {
    // Use caller-supplied contentHash if provided; otherwise derive from serialized data
    const contentHash = data.contentHash || this.generateContentHash(JSON.stringify(data));
    const [dataset] = await db
      .insert(datasets)
      .values([{ ...data, contentHash }])
      .returning();
    return dataset;
  }

  async update(
    id: string,
    data: Partial<typeof datasets.$inferInsert>,
  ): Promise<typeof datasets.$inferSelect | undefined> {
    const [dataset] = await db
      .update(datasets)
      .set(data)
      .where(eq(datasets.id, id))
      .returning();
    return dataset;
  }

  async delete(id: string): Promise<void> {
    await db.delete(datasets).where(eq(datasets.id, id));
  }

  async findSamplesByDataset(
    datasetId: string,
  ): Promise<(typeof datasetSamples.$inferSelect)[]> {
    return db
      .select()
      .from(datasetSamples)
      .where(eq(datasetSamples.datasetId, datasetId))
      .orderBy(datasetSamples.sampleIndex);
  }

  async createSample(
    data: typeof datasetSamples.$inferInsert,
  ): Promise<typeof datasetSamples.$inferSelect> {
    const [sample] = await db
      .insert(datasetSamples)
      .values(data)
      .returning();
    return sample;
  }

  async createSamples(
    data: (typeof datasetSamples.$inferInsert)[],
  ): Promise<(typeof datasetSamples.$inferSelect)[]> {
    return db.insert(datasetSamples).values(data).returning();
  }

  async deleteSamplesByDataset(datasetId: string): Promise<void> {
    await db
      .delete(datasetSamples)
      .where(eq(datasetSamples.datasetId, datasetId));
  }
}
