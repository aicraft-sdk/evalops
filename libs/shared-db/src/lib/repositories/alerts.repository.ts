import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { alertConfigs, alertEvents } from '../schema';
import { eq, desc } from 'drizzle-orm';

@Injectable()
export class AlertsRepository {
  async findConfigsByOrg(
    organizationId: string,
  ): Promise<(typeof alertConfigs.$inferSelect)[]> {
    return db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.organizationId, organizationId))
      .orderBy(desc(alertConfigs.createdAt));
  }

  async createConfig(
    data: Record<string, unknown>,
  ): Promise<typeof alertConfigs.$inferSelect> {
    const [config] = await db
      .insert(alertConfigs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
      .returning();
    return config;
  }

  async findConfigById(
    id: string,
  ): Promise<typeof alertConfigs.$inferSelect | undefined> {
    const [config] = await db
      .select()
      .from(alertConfigs)
      .where(eq(alertConfigs.id, id))
      .limit(1);
    return config;
  }

  async createEvent(
    data: Record<string, unknown>,
  ): Promise<typeof alertEvents.$inferSelect> {
    const [event] = await db
      .insert(alertEvents)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
      .returning();
    return event;
  }

  async findEventsByOrg(
    organizationId: string,
  ): Promise<(typeof alertEvents.$inferSelect)[]> {
    return db
      .select()
      .from(alertEvents)
      .where(eq(alertEvents.organizationId, organizationId))
      .orderBy(desc(alertEvents.createdAt));
  }
}
