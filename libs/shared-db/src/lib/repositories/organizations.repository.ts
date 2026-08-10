import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { organizations, organizationMembers } from '../schema';
import { and, eq } from 'drizzle-orm';

// EVALOPS_DEV_MODE must be set before any shared-db import (see db.ts) — safe
// to read here since it is already frozen by the time this module loads.
const isDevMode = process.env['EVALOPS_DEV_MODE'] === '1';

@Injectable()
export class OrganizationsRepository {
  async findById(id: string): Promise<typeof organizations.$inferSelect | undefined> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return org;
  }

  /**
   * Creates a brand new organization and, in the same transaction, grants
   * `userId` an ORG_ADMIN membership row scoped to that new org.
   *
   * Deliberately does NOT touch `users.organizationId`/`users.role` — those
   * fields represent the user's separate "home org" membership and are left
   * untouched, so a fresh registrant's default-org role is unaffected by
   * creating an additional org.
   *
   * `id`/`createdAt` are generated in application code (not left to the
   * column's Postgres-only `gen_random_uuid()`/`now()` SQL defaults) so this
   * path behaves identically against the SQLite dev-mode dialect.
   *
   * In dev mode the two inserts run sequentially, not wrapped in
   * `db.transaction()`: drizzle's better-sqlite3 driver only supports
   * synchronous transaction callbacks, while the node-postgres driver used
   * in production requires an async one — the same callback cannot satisfy
   * both dialects. Real atomicity (both writes or neither) is only
   * guaranteed on the production Postgres path. To avoid leaving an
   * orphaned, unmanageable org (and unbounded duplicate-name accumulation
   * on retry) if the second insert fails, the dev-mode branch explicitly
   * deletes the just-created org row on membership-insert failure before
   * rethrowing.
   */
  async createWithAdminMember(
    data: typeof organizations.$inferInsert,
    userId: string,
  ): Promise<typeof organizations.$inferSelect> {
    const now = new Date();
    // Defense-in-depth: `id`/`createdAt`/`updatedAt` are spread LAST so they
    // always win over anything present in caller-supplied `data`, even if a
    // future caller bypasses the controller's DTO validation and passes
    // those fields through. The DTO/ValidationPipe layer is the primary
    // defense (strips them from the HTTP request body); this ordering is the
    // second layer at the data-access boundary.
    const orgData = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as typeof organizations.$inferInsert;
    const memberData = (org: typeof organizations.$inferSelect) =>
      ({
        id: randomUUID(),
        organizationId: org.id,
        userId,
        role: 'org_admin',
        createdAt: now,
      }) as typeof organizationMembers.$inferInsert;

    if (isDevMode) {
      const [org] = await db.insert(organizations).values(orgData).returning();
      try {
        await db.insert(organizationMembers).values(memberData(org));
      } catch (err) {
        await db.delete(organizations).where(eq(organizations.id, org.id));
        throw err;
      }
      return org;
    }

    return db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values(orgData).returning();
      await tx.insert(organizationMembers).values(memberData(org));
      return org;
    });
  }

  /**
   * Looks up a user's membership row for a specific organization (their
   * ORG_ADMIN-scoped-to-a-new-org membership, NOT their home-org role).
   */
  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<typeof organizationMembers.$inferSelect | undefined> {
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      );
    return member;
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
