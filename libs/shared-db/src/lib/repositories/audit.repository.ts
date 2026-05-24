import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import {
  auditTrail,
  users,
  datasets,
  prompts,
  evalSpecs,
  runs,
} from '../schema';
import { type EnhancedAuditEntry } from '../schema';
import { eq, desc } from 'drizzle-orm';

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);

  async findByOrg(
    organizationId: string,
    limit = 100,
  ): Promise<(typeof auditTrail.$inferSelect)[]> {
    return db
      .select()
      .from(auditTrail)
      .where(eq(auditTrail.organizationId, organizationId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit);
  }

  async findEnhancedByOrg(
    organizationId: string,
    limit = 100,
  ): Promise<EnhancedAuditEntry[]> {
    const entries = await db
      .select({
        id: auditTrail.id,
        action: auditTrail.action,
        entityType: auditTrail.entityType,
        entityId: auditTrail.entityId,
        changes: auditTrail.changes,
        organizationId: auditTrail.organizationId,
        userId: auditTrail.userId,
        createdAt: auditTrail.createdAt,
        userName: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(auditTrail)
      .leftJoin(users, eq(auditTrail.userId, users.id))
      .where(eq(auditTrail.organizationId, organizationId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit);

    const enhancedEntries = await Promise.all(
      entries.map(async (entry) => {
        let entityName = 'Unknown';

        try {
          switch (entry.entityType) {
            case 'dataset':
              if (entry.entityId) {
                const [dataset] = await db
                  .select({ name: datasets.name })
                  .from(datasets)
                  .where(eq(datasets.id, entry.entityId))
                  .limit(1);
                entityName = dataset?.name || 'Unknown';
              }
              break;
            case 'prompt':
              if (entry.entityId) {
                const [prompt] = await db
                  .select({ name: prompts.name })
                  .from(prompts)
                  .where(eq(prompts.id, entry.entityId))
                  .limit(1);
                entityName = prompt?.name || 'Unknown';
              }
              break;
            case 'eval_spec':
              if (entry.entityId) {
                const [spec] = await db
                  .select({ name: evalSpecs.name })
                  .from(evalSpecs)
                  .where(eq(evalSpecs.id, entry.entityId))
                  .limit(1);
                entityName = spec?.name || 'Unknown';
              }
              break;
            case 'run':
              if (entry.entityId) {
                const [run] = await db
                  .select({ name: runs.name })
                  .from(runs)
                  .where(eq(runs.id, entry.entityId))
                  .limit(1);
                entityName = run?.name || 'Unknown';
              }
              break;
            default:
              entityName = entry.entityId || 'Unknown';
          }
        } catch (err: unknown) {
          this.logger.warn(
            `Failed to resolve entityName for ${entry.entityType}:${entry.entityId}`,
            err,
          );
          entityName = 'Unknown';
        }

        return {
          ...entry,
          entityName,
          description: `${entry.action} ${entry.entityType}${entityName !== 'Unknown' ? `: ${entityName}` : ''}`,
        } as EnhancedAuditEntry;
      }),
    );

    return enhancedEntries;
  }
}
