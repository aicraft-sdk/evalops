import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { organizations } from '../schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class OrganizationsRepository {
  async findById(id: string): Promise<typeof organizations.$inferSelect | undefined> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return org;
  }

  async findAll(): Promise<(typeof organizations.$inferSelect)[]> {
    return db.select().from(organizations).orderBy(organizations.name);
  }

  async create(
    data: typeof organizations.$inferInsert,
  ): Promise<typeof organizations.$inferSelect> {
    const [org] = await db
      .insert(organizations)
      .values(data)
      .returning();
    return org;
  }

  async update(
    id: string,
    data: Partial<typeof organizations.$inferInsert>,
  ): Promise<typeof organizations.$inferSelect | undefined> {
    const [org] = await db
      .update(organizations)
      .set({ ...data })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }
}
