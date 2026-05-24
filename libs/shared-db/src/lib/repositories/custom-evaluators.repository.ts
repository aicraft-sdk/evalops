import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { customEvaluators, evaluatorUsage } from '../schema';
import { eq } from 'drizzle-orm';

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
    data: Record<string, unknown>,
  ): Promise<typeof evaluatorUsage.$inferSelect> {
    const [usage] = await db
      .insert(evaluatorUsage)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
      .returning();
    return usage;
  }
}
