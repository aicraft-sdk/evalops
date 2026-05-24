import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { agents, agentVersions } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Drizzle 0.39 $inferInsert only includes notNull-without-default columns.
 * Nullable and defaulted columns (description, active, tags, metadata,
 * modelProvider, modelName, id, createdAt, updatedAt) are excluded, which
 * makes $inferInsert too narrow for our service data.
 *
 * Use $inferSelect (all columns) with auto-generated fields made optional
 * as the parameter type. Drizzle silently ignores unknown or undefined
 * values at runtime, so extra fields are safe. The `as any` cast at the
 * .values() / .set() call site satisfies Drizzle's internal Exactly<> check.
 */
type CreateAgentData = Omit<
  typeof agents.$inferSelect,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type UpdateAgentData = Partial<typeof agents.$inferSelect>;

type CreateAgentVersionData = Omit<
  typeof agentVersions.$inferSelect,
  'id' | 'createdAt'
> & {
  id?: string;
  createdAt?: Date;
};

@Injectable()
export class AgentsRepository {
  async create(
    data: CreateAgentData,
  ): Promise<typeof agents.$inferSelect> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [agent] = await db.insert(agents).values([data as any]).returning();
    return agent;
  }

  async findAllByOrg(
    organizationId: string,
    activeOnly = true,
  ): Promise<(typeof agents.$inferSelect)[]> {
    const conditions = activeOnly
      ? and(eq(agents.organizationId, organizationId), eq(agents.active, true))
      : eq(agents.organizationId, organizationId);
    return db
      .select()
      .from(agents)
      .where(conditions)
      .orderBy(desc(agents.createdAt));
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<typeof agents.$inferSelect | undefined> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(eq(agents.id, id), eq(agents.organizationId, organizationId)),
      );
    return agent;
  }

  async update(
    id: string,
    organizationId: string,
    data: UpdateAgentData,
  ): Promise<void> {
    await db
      .update(agents)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(data as any)
      .where(
        and(eq(agents.id, id), eq(agents.organizationId, organizationId)),
      );
  }

  async createVersion(
    data: CreateAgentVersionData,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(agentVersions).values([data as any]);
  }

  async findVersions(
    agentId: string,
    organizationId: string,
  ): Promise<(typeof agentVersions.$inferSelect)[]> {
    return db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.agentId, agentId),
          eq(agentVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(agentVersions.createdAt));
  }
}
