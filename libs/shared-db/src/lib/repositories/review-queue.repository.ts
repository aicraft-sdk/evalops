import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { reviewQueueItems } from '../schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export interface ReviewQueueFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  sourceType?: string;
  tags?: string[];
}

@Injectable()
export class ReviewQueueRepository {
  async create(
    data: typeof reviewQueueItems.$inferInsert,
  ): Promise<typeof reviewQueueItems.$inferSelect> {
    const [item] = await db
      .insert(reviewQueueItems)
      .values(data)
      .returning();
    return item;
  }

  async findById(
    id: string,
  ): Promise<typeof reviewQueueItems.$inferSelect | undefined> {
    const [item] = await db
      .select()
      .from(reviewQueueItems)
      .where(eq(reviewQueueItems.id, id));
    return item;
  }

  async findByOrg(
    organizationId: string,
    filters?: ReviewQueueFilters,
    limit = 50,
  ): Promise<(typeof reviewQueueItems.$inferSelect)[]> {
    const conditions = [eq(reviewQueueItems.organizationId, organizationId)];

    if (filters?.status) {
      conditions.push(eq(reviewQueueItems.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(reviewQueueItems.priority, filters.priority));
    }
    if (filters?.assigneeId) {
      conditions.push(eq(reviewQueueItems.assigneeId, filters.assigneeId));
    }
    if (filters?.sourceType) {
      conditions.push(eq(reviewQueueItems.sourceType, filters.sourceType));
    }
    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sql`${reviewQueueItems.tags} @> ${JSON.stringify(filters.tags)}::jsonb` as any,
      );
    }

    return db
      .select()
      .from(reviewQueueItems)
      .where(and(...conditions))
      .orderBy(desc(reviewQueueItems.createdAt))
      .limit(limit);
  }

  async update(
    id: string,
    data: Partial<typeof reviewQueueItems.$inferSelect>,
  ): Promise<typeof reviewQueueItems.$inferSelect | undefined> {
    const resolvedAt =
      data.status === 'fixed' ||
      data.status === 'dismissed' ||
      data.status === 'promoted'
        ? new Date()
        : undefined;

    const updateData: Partial<typeof reviewQueueItems.$inferSelect> = {
      ...data,
      updatedAt: new Date(),
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    };

    const [updated] = await db
      .update(reviewQueueItems)
      .set(updateData)
      .where(eq(reviewQueueItems.id, id))
      .returning();
    return updated;
  }
}
