import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { users, userRoles } from '../schema';
import { eq } from 'drizzle-orm';

export type UpsertUserInput = {
  id: string;
  email: string;
  passwordHash?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
  organizationId?: string | null;
  entraId?: string | null;
  upn?: string | null;
  tenantId?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  isActive?: boolean | null;
  lastLoginAt?: Date | null;
  [key: string]: unknown;
};

@Injectable()
export class UsersRepository {
  async findById(
    id: string,
  ): Promise<typeof users.$inferSelect | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(
    email: string,
  ): Promise<typeof users.$inferSelect | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async findAll(): Promise<(typeof users.$inferSelect)[]> {
    return db.select().from(users).orderBy(users.email);
  }

  /**
   * Targeted single-column update — only `role` (plus a server-set
   * `updatedAt`) is ever written. Deliberately NOT built on `upsert()`
   * (insert + onConflictDoUpdate spreading the whole fetched row): spreading
   * `createdAt` back through an INSERT's VALUES clause round-trips it
   * through drizzle's `PgTimestamp.mapToDriverValue`
   * (`value.toISOString()`), which throws `RangeError: Invalid time value`
   * for rows read back via `PgTimestamp.mapFromDriverValue`'s
   * `+"+0000"` suffixing in SQLite dev mode. A plain `UPDATE ... SET role,
   * updated_at` never touches `created_at` at all, avoiding that class of
   * failure entirely — mirrors `OrganizationsRepository.update()`'s existing
   * allowlist pattern.
   */
  async updateRole(
    id: string,
    role: string,
  ): Promise<typeof users.$inferSelect | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() } as Partial<
        typeof users.$inferInsert
      >)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async upsert(userData: UpsertUserInput): Promise<typeof users.$inferSelect> {
    const { id: _id, ...updateData } = userData;
    const [user] = await db
      .insert(users)
      .values(userData as typeof users.$inferInsert)
      .onConflictDoUpdate({
        target: users.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set: {
          ...(updateData as Partial<typeof users.$inferInsert>),
          updatedAt: new Date(),
        } as any,
      })
      .returning();
    return user;
  }

  async findByRole(
    roleId: string,
  ): Promise<Omit<typeof users.$inferSelect, 'passwordHash'>[]> {
    return db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        organizationId: users.organizationId,
        entraId: users.entraId,
        upn: users.upn,
        tenantId: users.tenantId,
        department: users.department,
        jobTitle: users.jobTitle,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(eq(userRoles.roleId, roleId));
  }
}
