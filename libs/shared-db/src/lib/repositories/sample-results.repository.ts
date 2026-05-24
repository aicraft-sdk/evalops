import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { sampleResults, runAnnotations } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

@Injectable()
export class SampleResultsRepository {
  async create(
    data: Record<string, unknown>,
  ): Promise<typeof sampleResults.$inferSelect> {
    const [result] = await db
      .insert(sampleResults)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
      .returning();
    return result;
  }

  async findByRun(
    runId: string,
  ): Promise<(typeof sampleResults.$inferSelect)[]> {
    return db
      .select()
      .from(sampleResults)
      .where(eq(sampleResults.runId, runId))
      .orderBy(sampleResults.sampleIndex, sampleResults.repetition);
  }

  // Run Annotations
  async createAnnotation(
    data: typeof runAnnotations.$inferInsert,
  ): Promise<typeof runAnnotations.$inferSelect> {
    const [annotation] = await db
      .insert(runAnnotations)
      .values(data)
      .returning();
    return annotation;
  }

  async findAnnotationById(
    id: string,
  ): Promise<typeof runAnnotations.$inferSelect | undefined> {
    const [annotation] = await db
      .select()
      .from(runAnnotations)
      .where(eq(runAnnotations.id, id));
    return annotation;
  }

  async findAnnotationsForRun(
    runId: string,
    spanId?: string,
  ): Promise<(typeof runAnnotations.$inferSelect)[]> {
    const conditions = [eq(runAnnotations.runId, runId)];
    if (spanId) {
      conditions.push(eq(runAnnotations.spanId, spanId));
    }
    return db
      .select()
      .from(runAnnotations)
      .where(and(...conditions))
      .orderBy(desc(runAnnotations.createdAt));
  }

  async updateAnnotation(
    id: string,
    data: Partial<typeof runAnnotations.$inferInsert>,
  ): Promise<typeof runAnnotations.$inferSelect> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };
    const [updated] = await db
      .update(runAnnotations)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updateData as any)
      .where(eq(runAnnotations.id, id))
      .returning();
    return updated;
  }

  async deleteAnnotation(id: string): Promise<void> {
    await db.delete(runAnnotations).where(eq(runAnnotations.id, id));
  }
}
