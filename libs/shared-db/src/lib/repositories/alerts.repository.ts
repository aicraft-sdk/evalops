import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { alertConfigs, alertEvents } from '../schema';
import { eq, desc } from 'drizzle-orm';

// Insert (full-row) payloads are built from $inferSelect — required columns
// picked explicitly, everything else (auto-generated or DB-defaulted)
// optional — never $inferInsert directly: drizzle's $inferInsert
// conditional types (NotNull/HasDefault branding) silently collapse to
// only the required columns (dropping optional/nullable columns from the
// type entirely) when compiled under strictNullChecks: false — which
// every backend app's tsconfig uses today (only shared-db's own tsconfig
// sets strict: true). $inferSelect does not depend on that branding and
// stays fully typed either way. See runs.repository.update-types.spec.ts
// / agents.repository.ts for the reproduction.
type CreateAlertConfigData = Pick<
  typeof alertConfigs.$inferSelect,
  'name' | 'type' | 'conditions' | 'channels' | 'organizationId' | 'createdBy'
> &
  Partial<
    Omit<
      typeof alertConfigs.$inferSelect,
      | 'name'
      | 'type'
      | 'conditions'
      | 'channels'
      | 'organizationId'
      | 'createdBy'
    >
  >;

type CreateAlertEventData = Pick<
  typeof alertEvents.$inferSelect,
  'configId' | 'severity' | 'title' | 'message' | 'organizationId'
> &
  Partial<
    Omit<
      typeof alertEvents.$inferSelect,
      'configId' | 'severity' | 'title' | 'message' | 'organizationId'
    >
  >;

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
    data: CreateAlertConfigData,
  ): Promise<typeof alertConfigs.$inferSelect> {
    const [config] = await db.insert(alertConfigs).values([data]).returning();
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
    data: CreateAlertEventData,
  ): Promise<typeof alertEvents.$inferSelect> {
    const [event] = await db.insert(alertEvents).values([data]).returning();
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
