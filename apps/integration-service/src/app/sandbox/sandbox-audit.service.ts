import { Injectable, Logger } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  sandboxAuditLog,
  type InsertSandboxAuditLog,
} from '@evalops/shared-db';
import { eq, desc } from 'drizzle-orm';
import { createHash } from 'crypto';

export type SandboxOperation =
  | 'create'
  | 'execute'
  | 'delete'
  | 'security_violation';

export interface ResourceUsage {
  cpu?: number;
  memory?: number; // bytes
  executionTime?: number; // milliseconds
}

export interface AuditLogContext {
  sandboxId: string;
  operation: SandboxOperation;
  userId: string;
  organizationId: string;
  requestId?: string;
  resourceUsage?: ResourceUsage;
  securityViolations?: string[];
  code?: string; // Code will be hashed before storage
}

/**
 * Sandbox Audit Service
 *
 * Provides comprehensive audit logging for all sandbox operations.
 * Logs are stored in the sandbox_audit_log table and include:
 * - Operation type (create, execute, delete, security_violation)
 * - Resource usage metrics
 * - Security violations
 * - Code hashes for anomaly detection
 * - Request correlation IDs
 */
@Injectable()
export class SandboxAuditService {
  private readonly logger = new Logger(SandboxAuditService.name);

  /**
   * Log a sandbox operation
   */
  async logOperation(context: AuditLogContext): Promise<string> {
    try {
      // Hash code if provided
      const codeHash = context.code
        ? this.hashCode(context.code)
        : undefined;

      const auditLog: InsertSandboxAuditLog = {
        sandboxId: context.sandboxId,
        operation: context.operation,
        userId: context.userId,
        organizationId: context.organizationId,
        requestId: context.requestId,
        resourceUsage: context.resourceUsage
          ? {
              cpu: context.resourceUsage.cpu,
              memory: context.resourceUsage.memory,
              executionTime: context.resourceUsage.executionTime,
            }
          : undefined,
        securityViolations: context.securityViolations,
        codeHash,
      };

      const result = await db
        .insert(sandboxAuditLog)
        .values([auditLog])
        .returning({ id: sandboxAuditLog.id });

      const logId = result[0]?.id;

      this.logger.debug(`Audit log created: ${logId}`, {
        sandboxId: context.sandboxId,
        operation: context.operation,
        requestId: context.requestId,
      });

      return logId || '';
    } catch (error: any) {
      this.logger.error(
        `Failed to create audit log: ${error.message}`,
        error.stack,
      );
      // Don't throw - audit logging failures shouldn't break operations
      return '';
    }
  }

  /**
   * Log sandbox creation
   */
  async logCreation(
    sandboxId: string,
    userId: string,
    organizationId: string,
    requestId?: string,
  ): Promise<string> {
    return this.logOperation({
      sandboxId,
      operation: 'create',
      userId,
      organizationId,
      requestId,
    });
  }

  /**
   * Log code execution
   */
  async logExecution(
    sandboxId: string,
    userId: string,
    organizationId: string,
    code: string,
    resourceUsage?: ResourceUsage,
    securityViolations?: string[],
    requestId?: string,
  ): Promise<string> {
    return this.logOperation({
      sandboxId,
      operation: 'execute',
      userId,
      organizationId,
      requestId,
      code,
      resourceUsage,
      securityViolations,
    });
  }

  /**
   * Log sandbox deletion
   */
  async logDeletion(
    sandboxId: string,
    userId: string,
    organizationId: string,
    requestId?: string,
  ): Promise<string> {
    return this.logOperation({
      sandboxId,
      operation: 'delete',
      userId,
      organizationId,
      requestId,
    });
  }

  /**
   * Log security violation
   */
  async logSecurityViolation(
    sandboxId: string,
    userId: string,
    organizationId: string,
    violations: string[],
    code?: string,
    requestId?: string,
  ): Promise<string> {
    return this.logOperation({
      sandboxId,
      operation: 'security_violation',
      userId,
      organizationId,
      requestId,
      code,
      securityViolations: violations,
    });
  }

  /**
   * Get audit logs for a sandbox
   */
  async getSandboxAuditLogs(
    sandboxId: string,
    limit = 100,
  ): Promise<Array<InsertSandboxAuditLog & { id: string; createdAt: Date }>> {
    try {
      const logs = await db
        .select()
        .from(sandboxAuditLog)
        .where(eq(sandboxAuditLog.sandboxId, sandboxId))
        .orderBy(desc(sandboxAuditLog.createdAt))
        .limit(limit);

      return logs;
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve audit logs: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Get audit logs for an organization
   */
  async getOrganizationAuditLogs(
    organizationId: string,
    limit = 100,
  ): Promise<Array<InsertSandboxAuditLog & { id: string; createdAt: Date }>> {
    try {
      const logs = await db
        .select()
        .from(sandboxAuditLog)
        .where(eq(sandboxAuditLog.organizationId, organizationId))
        .orderBy(desc(sandboxAuditLog.createdAt))
        .limit(limit);

      return logs;
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve organization audit logs: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Get audit logs by code hash (for anomaly detection)
   */
  async getAuditLogsByCodeHash(
    codeHash: string,
    limit = 100,
  ): Promise<Array<InsertSandboxAuditLog & { id: string; createdAt: Date }>> {
    try {
      const logs = await db
        .select()
        .from(sandboxAuditLog)
        .where(eq(sandboxAuditLog.codeHash, codeHash))
        .orderBy(desc(sandboxAuditLog.createdAt))
        .limit(limit);

      return logs;
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve audit logs by code hash: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Hash code using SHA-256
   */
  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
