import { Injectable } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { personalAccessTokens, PersonalAccessToken } from '../schema';

export type CreatePATInput = {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  tokenHash: string;
  scopes: string[];
  expiresAt?: Date;
};

@Injectable()
export class PersonalAccessTokensRepository {
  async findByTokenHash(hash: string): Promise<PersonalAccessToken | undefined> {
    let [pat] = await db
      .select()
      .from(personalAccessTokens)
      .where(
        and(
          eq(personalAccessTokens.tokenHash, hash),
          isNull(personalAccessTokens.revokedAt),
        ),
      );
    // Normalize scopes: SQLite returns JSON text; Postgres returns a string array already parsed by drizzle
    if (pat && typeof pat.scopes === 'string') {
      pat = { ...pat, scopes: JSON.parse(pat.scopes as unknown as string) };
    }
    return pat;
  }

  async findAll(userId: string): Promise<PersonalAccessToken[]> {
    return db
      .select()
      .from(personalAccessTokens)
      .where(
        and(
          eq(personalAccessTokens.userId, userId),
          isNull(personalAccessTokens.revokedAt),
        ),
      )
      .orderBy(personalAccessTokens.createdAt);
  }

  async create(data: CreatePATInput): Promise<PersonalAccessToken> {
    const [pat] = await db
      .insert(personalAccessTokens)
      .values({
        id: data.id,
        organizationId: data.organizationId,
        userId: data.userId,
        name: data.name,
        tokenHash: data.tokenHash,
        scopes: data.scopes,
        expiresAt: data.expiresAt ?? null,
      } as typeof personalAccessTokens.$inferInsert)
      .returning();
    return pat;
  }

  async updateLastUsed(id: string): Promise<void> {
    await db
      .update(personalAccessTokens)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Exactly<> excludes nullable cols
      .set({ lastUsedAt: new Date() } as any)
      .where(eq(personalAccessTokens.id, id));
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const result = await db
      .update(personalAccessTokens)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Exactly<> excludes nullable cols
      .set({ revokedAt: new Date() } as any)
      .where(
        and(
          eq(personalAccessTokens.id, id),
          eq(personalAccessTokens.userId, userId),
          isNull(personalAccessTokens.revokedAt),
        ),
      )
      .returning();
    return result.length > 0;
  }
}
