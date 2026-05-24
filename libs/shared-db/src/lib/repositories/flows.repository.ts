import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { flows } from '../schema';
import { eq, desc } from 'drizzle-orm';
import * as crypto from 'crypto';

@Injectable()
export class FlowsRepository {
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async findAllByOrg(
    organizationId: string,
  ): Promise<(typeof flows.$inferSelect)[]> {
    return db
      .select()
      .from(flows)
      .where(eq(flows.organizationId, organizationId))
      .orderBy(desc(flows.createdAt));
  }

  async findById(
    id: string,
  ): Promise<typeof flows.$inferSelect | undefined> {
    const [flow] = await db.select().from(flows).where(eq(flows.id, id));
    return flow;
  }

  async create(
    data: typeof flows.$inferInsert,
  ): Promise<typeof flows.$inferSelect> {
    const contentHash = this.generateContentHash(JSON.stringify(data));
    const [flow] = await db
      .insert(flows)
      .values([{ ...data, contentHash }])
      .returning();
    return flow;
  }

  async update(
    id: string,
    data: Partial<typeof flows.$inferInsert>,
  ): Promise<typeof flows.$inferSelect | undefined> {
    const [flow] = await db
      .update(flows)
      .set(data)
      .where(eq(flows.id, id))
      .returning();
    return flow;
  }

  async delete(id: string): Promise<void> {
    await db.delete(flows).where(eq(flows.id, id));
  }
}
