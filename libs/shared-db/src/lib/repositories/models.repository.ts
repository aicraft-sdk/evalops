import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { models } from '../schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class ModelsRepository {
  async findAll(
    providerId?: string,
  ): Promise<(typeof models.$inferSelect)[]> {
    if (providerId) {
      return db
        .select()
        .from(models)
        .where(eq(models.providerId, providerId))
        .orderBy(models.name);
    }
    return db.select().from(models).orderBy(models.name);
  }

  async findById(
    id: string,
  ): Promise<typeof models.$inferSelect | undefined> {
    const [model] = await db
      .select()
      .from(models)
      .where(eq(models.id, id));
    return model;
  }

  async create(
    data: typeof models.$inferInsert,
  ): Promise<typeof models.$inferSelect> {
    const [model] = await db.insert(models).values([data]).returning();
    return model;
  }

  async update(
    id: string,
    data: Partial<typeof models.$inferInsert>,
  ): Promise<typeof models.$inferSelect | undefined> {
    const [model] = await db
      .update(models)
      .set({ ...data })
      .where(eq(models.id, id))
      .returning();
    return model;
  }

  async delete(id: string): Promise<void> {
    await db.delete(models).where(eq(models.id, id));
  }
}
