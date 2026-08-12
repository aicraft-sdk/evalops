import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { judgeCache } from '../schema';
import { eq } from 'drizzle-orm';

type RequiredCreateCols =
  | 'cacheKey' | 'evaluatorName' | 'score' | 'cost' | 'model' | 'organizationId';

type CreateJudgeCacheInput = Pick<
  typeof judgeCache.$inferSelect,
  RequiredCreateCols
> &
  Partial<Omit<typeof judgeCache.$inferSelect, RequiredCreateCols | 'id' | 'createdAt'>>;

@Injectable()
export class JudgeCacheRepository {
  async findByCacheKey(
    cacheKey: string,
  ): Promise<typeof judgeCache.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(judgeCache)
      .where(eq(judgeCache.cacheKey, cacheKey));
    return row;
  }

  async create(
    data: CreateJudgeCacheInput,
  ): Promise<typeof judgeCache.$inferSelect> {
    const [row] = await db.insert(judgeCache).values(data).returning();
    return row;
  }
}
