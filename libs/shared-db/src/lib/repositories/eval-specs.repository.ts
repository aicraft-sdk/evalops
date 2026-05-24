import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { evalSpecs } from '../schema';
import { eq, desc } from 'drizzle-orm';

@Injectable()
export class EvalSpecsRepository {
  async findAllByOrg(
    organizationId: string,
  ): Promise<(typeof evalSpecs.$inferSelect)[]> {
    return db
      .select()
      .from(evalSpecs)
      .where(eq(evalSpecs.organizationId, organizationId))
      .orderBy(desc(evalSpecs.createdAt));
  }

  async findById(
    id: string,
  ): Promise<typeof evalSpecs.$inferSelect | undefined> {
    const [spec] = await db
      .select()
      .from(evalSpecs)
      .where(eq(evalSpecs.id, id));
    return spec;
  }

  async create(
    data: typeof evalSpecs.$inferInsert,
  ): Promise<typeof evalSpecs.$inferSelect> {
    const [spec] = await db
      .insert(evalSpecs)
      .values([data])
      .returning();
    return spec;
  }

  async update(
    id: string,
    data: Partial<typeof evalSpecs.$inferInsert>,
  ): Promise<typeof evalSpecs.$inferSelect> {
    const [spec] = await db
      .update(evalSpecs)
      .set(data)
      .where(eq(evalSpecs.id, id))
      .returning();
    return spec;
  }

  async delete(id: string): Promise<void> {
    await db.delete(evalSpecs).where(eq(evalSpecs.id, id));
  }
}
