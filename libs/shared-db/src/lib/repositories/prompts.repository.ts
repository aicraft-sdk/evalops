import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { prompts } from '../schema';
import { eq, desc } from 'drizzle-orm';
import * as crypto from 'crypto';

@Injectable()
export class PromptsRepository {
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async findAllByOrg(
    organizationId: string,
  ): Promise<(typeof prompts.$inferSelect)[]> {
    return db
      .select()
      .from(prompts)
      .where(eq(prompts.organizationId, organizationId))
      .orderBy(desc(prompts.createdAt));
  }

  async findById(
    id: string,
  ): Promise<typeof prompts.$inferSelect | undefined> {
    const [prompt] = await db
      .select()
      .from(prompts)
      .where(eq(prompts.id, id));
    return prompt;
  }

  async findByContentHash(
    contentHash: string,
  ): Promise<typeof prompts.$inferSelect | undefined> {
    const [prompt] = await db
      .select()
      .from(prompts)
      .where(eq(prompts.contentHash, contentHash));
    return prompt;
  }

  async create(
    data: typeof prompts.$inferInsert,
  ): Promise<typeof prompts.$inferSelect> {
    const contentHash = this.generateContentHash(data.content);
    const [prompt] = await db
      .insert(prompts)
      .values([{ ...data, contentHash }])
      .returning();
    return prompt;
  }

  async update(
    id: string,
    data: Partial<typeof prompts.$inferInsert>,
  ): Promise<typeof prompts.$inferSelect | undefined> {
    const [prompt] = await db
      .update(prompts)
      .set(data)
      .where(eq(prompts.id, id))
      .returning();
    return prompt;
  }

  async delete(id: string): Promise<void> {
    await db.delete(prompts).where(eq(prompts.id, id));
  }
}
