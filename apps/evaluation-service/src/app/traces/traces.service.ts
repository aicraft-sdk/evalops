import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import { traceSpans, runs, type TraceSpan } from '@evalops/shared-db';
import { eq, and, gte, lte, sql, like, desc, asc } from 'drizzle-orm';
import {
  GetSpansQueryDto,
  SearchSpansQueryDto,
  PaginatedSpansResponse,
  SpanTreeResponse,
  SpanTreeNode,
} from './traces.dto';

@Injectable()
export class TracesService {
  private readonly logger = new Logger(TracesService.name);

  /**
   * Get paginated spans for a specific run with optional filters
   */
  async getSpansForRun(
    runId: string,
    organizationId: string,
    query: GetSpansQueryDto,
  ): Promise<PaginatedSpansResponse> {
    // Verify run exists and belongs to organization
    const [run] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.organizationId, organizationId)))
      .limit(1);

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Build where conditions
    const conditions = [eq(traceSpans.runId, runId)];

    if (query.spanName) {
      conditions.push(like(traceSpans.name, `%${query.spanName}%`));
    }

    if (query.minDuration !== undefined || query.maxDuration !== undefined) {
      // Calculate duration from startTime and endTime
      const durationExpr = sql<number>`EXTRACT(EPOCH FROM (COALESCE(${traceSpans.endTime}, NOW()) - ${traceSpans.startTime})) * 1000`;
      
      if (query.minDuration !== undefined) {
        conditions.push(gte(durationExpr, query.minDuration));
      }
      if (query.maxDuration !== undefined) {
        conditions.push(lte(durationExpr, query.maxDuration));
      }
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(traceSpans)
      .where(and(...conditions));

    const total = Number(count);

    // Get paginated spans
    const spans = await db
      .select()
      .from(traceSpans)
      .where(and(...conditions))
      .orderBy(asc(traceSpans.startTime))
      .limit(limit)
      .offset(offset);

    return {
      spans,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get a single span by spanId with its direct children
   */
  async getSpanById(
    spanId: string,
    organizationId: string,
  ): Promise<{ span: TraceSpan; children: TraceSpan[] }> {
    const [span] = await db
      .select()
      .from(traceSpans)
      .where(
        and(
          eq(traceSpans.spanId, spanId),
          eq(traceSpans.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!span) {
      throw new NotFoundException(`Span ${spanId} not found`);
    }

    // Get direct children
    const children = await db
      .select()
      .from(traceSpans)
      .where(
        and(
          eq(traceSpans.parentSpanId, spanId),
          eq(traceSpans.organizationId, organizationId),
        ),
      )
      .orderBy(asc(traceSpans.startTime));

    return { span, children };
  }

  /**
   * Get hierarchical span tree for a run
   */
  async getSpanTree(
    runId: string,
    organizationId: string,
  ): Promise<SpanTreeResponse> {
    // Verify run exists and belongs to organization
    const [run] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.organizationId, organizationId)))
      .limit(1);

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get all spans for the run
    const spans = await db
      .select()
      .from(traceSpans)
      .where(
        and(
          eq(traceSpans.runId, runId),
          eq(traceSpans.organizationId, organizationId),
        ),
      )
      .orderBy(asc(traceSpans.startTime));

    // Build tree structure
    const spanMap = new Map<string, SpanTreeNode>();
    const rootNodes: SpanTreeNode[] = [];

    // First pass: create nodes for all spans
    for (const span of spans) {
      spanMap.set(span.spanId, {
        span,
        children: [],
      });
    }

    // Second pass: build parent-child relationships
    for (const span of spans) {
      const node = spanMap.get(span.spanId);
      if (!node) {
        // Should not happen: every span was added to spanMap in the first pass
        continue;
      }
      if (span.parentSpanId) {
        const parentNode = spanMap.get(span.parentSpanId);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          // Parent not found, treat as root
          rootNodes.push(node);
        }
      } else {
        // Root span
        rootNodes.push(node);
      }
    }

    return {
      spans,
      tree: rootNodes,
    };
  }

  /**
   * Search spans across runs with filters
   */
  async searchSpans(
    organizationId: string,
    query: SearchSpansQueryDto,
  ): Promise<PaginatedSpansResponse> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Build where conditions
    const conditions = [eq(traceSpans.organizationId, organizationId)];

    if (query.runId) {
      conditions.push(eq(traceSpans.runId, query.runId));
    }

    if (query.traceId) {
      conditions.push(eq(traceSpans.traceId, query.traceId));
    }

    if (query.spanName) {
      conditions.push(like(traceSpans.name, `%${query.spanName}%`));
    }

    if (query.startTime) {
      conditions.push(gte(traceSpans.startTime, new Date(query.startTime)));
    }

    if (query.endTime) {
      conditions.push(lte(traceSpans.startTime, new Date(query.endTime)));
    }

    if (query.attributes) {
      try {
        const attrFilter = JSON.parse(query.attributes);
        // Search in JSONB attributes using PostgreSQL JSONB operators
        for (const [key, value] of Object.entries(attrFilter)) {
          conditions.push(
            sql`${traceSpans.attributes}->>${key} = ${String(value)}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Invalid attributes filter JSON: ${query.attributes}`,
          error,
        );
      }
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(traceSpans)
      .where(and(...conditions));

    const total = Number(count);

    // Get paginated spans
    const spans = await db
      .select()
      .from(traceSpans)
      .where(and(...conditions))
      .orderBy(desc(traceSpans.startTime))
      .limit(limit)
      .offset(offset);

    return {
      spans,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }
}
