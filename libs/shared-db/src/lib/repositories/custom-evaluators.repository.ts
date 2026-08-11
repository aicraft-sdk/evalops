import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { customEvaluators, evaluatorUsage } from '../schema';
import { eq } from 'drizzle-orm';

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
type CreateEvaluatorUsageData = Pick<
  typeof evaluatorUsage.$inferSelect,
  'evaluatorId' | 'organizationId' | 'usedBy' | 'success'
> &
  Partial<
    Omit<
      typeof evaluatorUsage.$inferSelect,
      'evaluatorId' | 'organizationId' | 'usedBy' | 'success'
    >
  >;

@Injectable()
export class CustomEvaluatorsRepository {
  async findById(
    id: string,
  ): Promise<typeof customEvaluators.$inferSelect | undefined> {
    const [evaluator] = await db
      .select()
      .from(customEvaluators)
      .where(eq(customEvaluators.id, id))
      .limit(1);
    return evaluator;
  }

  async createUsage(
    data: CreateEvaluatorUsageData,
  ): Promise<typeof evaluatorUsage.$inferSelect> {
    const [usage] = await db
      .insert(evaluatorUsage)
      .values([data])
      .returning();
    return usage;
  }
}
