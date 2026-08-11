import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { agents, agentVersions } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

// Both create()/createVersion() (insert) and update() (partial update)
// payloads below are built from $inferSelect, never $inferInsert:
// drizzle's $inferInsert conditional types (NotNull/HasDefault branding)
// silently collapse to only the required columns (dropping optional/
// nullable columns from the type entirely, with or without Partial<>)
// when compiled under strictNullChecks: false — which every backend
// app's tsconfig uses today (only shared-db's own tsconfig sets
// strict: true). $inferSelect does not depend on that branding and
// stays fully typed either way. See
// runs.repository.update-types.spec.ts for the update() reproduction;
// confirmed directly on this file for create()/createVersion() too
// (core-service failed to compile with $inferInsert here).
type UpdateAgentData = Partial<typeof agents.$inferSelect>;

@Injectable()
export class AgentsRepository {
  async create(
    data: Omit<typeof agents.$inferSelect, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): Promise<typeof agents.$inferSelect> {
    const [agent] = await db.insert(agents).values([data]).returning();
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
      .set(data)
      .where(
        and(eq(agents.id, id), eq(agents.organizationId, organizationId)),
      );
  }

  async createVersion(
    data: Omit<typeof agentVersions.$inferSelect, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: Date;
    },
  ): Promise<void> {
    await db.insert(agentVersions).values([data]);
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
