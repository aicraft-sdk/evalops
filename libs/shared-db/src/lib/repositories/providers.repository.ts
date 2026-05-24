import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { aiProviders } from '../schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class ProvidersRepository {
  async findAll(): Promise<(typeof aiProviders.$inferSelect)[]> {
    return db.select().from(aiProviders).orderBy(aiProviders.name);
  }

  async findById(
    id: string,
  ): Promise<typeof aiProviders.$inferSelect | undefined> {
    const [provider] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id));
    return provider;
  }

  async create(
    data: typeof aiProviders.$inferInsert,
  ): Promise<typeof aiProviders.$inferSelect> {
    const [provider] = await db
      .insert(aiProviders)
      .values([data])
      .returning();
    return provider;
  }

  async update(
    id: string,
    data: Partial<typeof aiProviders.$inferInsert>,
  ): Promise<typeof aiProviders.$inferSelect | undefined> {
    const [provider] = await db
      .update(aiProviders)
      .set({ ...data })
      .where(eq(aiProviders.id, id))
      .returning();
    return provider;
  }

  async delete(id: string): Promise<void> {
    await db.delete(aiProviders).where(eq(aiProviders.id, id));
  }
}
