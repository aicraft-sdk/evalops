import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { sampleResults, runAnnotations } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

// Insert (full-row) payload built from $inferSelect — required columns
// picked explicitly, everything else (auto-generated or DB-defaulted)
// optional — never $inferInsert directly: drizzle's $inferInsert
// conditional types (NotNull/HasDefault branding) silently collapse to
// only the required columns (dropping optional/nullable columns from the
// type entirely) when compiled under strictNullChecks: false — which
// every backend app's tsconfig uses today (only shared-db's own tsconfig
// sets strict: true). $inferSelect does not depend on that branding and
// stays fully typed either way. See runs.repository.update-types.spec.ts
// / agents.repository.ts for the reproduction.
type CreateSampleResultData = Pick<
  typeof sampleResults.$inferSelect,
  'runId' | 'sampleIndex' | 'repetition' | 'input' | 'evaluationResults' | 'organizationId'
> &
  Partial<
    Omit<
      typeof sampleResults.$inferSelect,
      'runId' | 'sampleIndex' | 'repetition' | 'input' | 'evaluationResults' | 'organizationId'
    >
  >;

@Injectable()
export class SampleResultsRepository {
  async create(
    data: CreateSampleResultData,
  ): Promise<typeof sampleResults.$inferSelect> {
    const [result] = await db
      .insert(sampleResults)
      .values([data])
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
    data: Partial<typeof runAnnotations.$inferSelect>,
  ): Promise<typeof runAnnotations.$inferSelect> {
    const updateData: Partial<typeof runAnnotations.$inferSelect> = {
      ...data,
      updatedAt: new Date(),
    };
    const [updated] = await db
      .update(runAnnotations)
      .set(updateData)
      .where(eq(runAnnotations.id, id))
      .returning();
    return updated;
  }

  async deleteAnnotation(id: string): Promise<void> {
    await db.delete(runAnnotations).where(eq(runAnnotations.id, id));
  }
}
