import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import { traceSpans, type InsertTraceSpan } from '@evalops/shared-db';
import { eq } from 'drizzle-orm';
import {
  OtlpExportTraceServiceRequest,
  OtlpSpan,
  OtlpAttribute,
  OtlpAttributeValue,
} from './otlp.dto';

/**
 * Flattened JSON-compatible value produced when converting an OTLP
 * AttributeValue (string/int/double/bool/array/kvlist/bytes) to plain JSON.
 */
type OtlpAttributeJsonValue =
  | string
  | number
  | boolean
  | OtlpAttributeJsonValue[]
  | { [key: string]: OtlpAttributeJsonValue }
  | undefined;

/**
 * OTLP Service
 *
 * Converts OTLP spans to TraceSpan format and stores them in trace_spans table.
 * Extracts runId from resource attributes (evalops.run_id).
 */
@Injectable()
export class OtlpService {
  private readonly logger = new Logger(OtlpService.name);

  /**
   * Process OTLP trace export request
   */
  async processTraceExport(
    request: OtlpExportTraceServiceRequest,
    organizationId: string
  ): Promise<{ spansProcessed: number; spansRejected: number }> {
    let spansProcessed = 0;
    let spansRejected = 0;

    for (const resourceSpan of request.resourceSpans) {
      // Extract runId from resource attributes
      const runId = this.extractRunId(resourceSpan.resource?.attributes);
      if (!runId) {
        this.logger.warn(
          'Resource span missing evalops.run_id attribute, skipping'
        );
        spansRejected += this.countSpans(resourceSpan);
        continue;
      }

      // Process all scope spans
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const otlpSpan of scopeSpan.spans) {
          try {
            await this.convertAndStoreSpan(otlpSpan, runId, organizationId);
            spansProcessed++;
          } catch (error) {
            this.logger.error(
              `Failed to process span ${otlpSpan.spanId}: ${error?.message}`
            );
            spansRejected++;
          }
        }
      }
    }

    this.logger.log(
      `Processed ${spansProcessed} spans, rejected ${spansRejected} spans`
    );

    return { spansProcessed, spansRejected };
  }

  /**
   * Convert OTLP span to TraceSpan format and store in database
   */
  private async convertAndStoreSpan(
    otlpSpan: OtlpSpan,
    runId: string,
    organizationId: string
  ): Promise<void> {
    // Validate required fields
    if (!otlpSpan.traceId || !otlpSpan.spanId || !otlpSpan.name) {
      throw new BadRequestException(
        'Span missing required fields: traceId, spanId, or name'
      );
    }

    // Convert hex strings to UUID format if needed (OTLP uses hex, we store as-is)
    const traceId = this.hexToUuid() || otlpSpan.traceId;
    const spanId = this.hexToUuid() || otlpSpan.spanId;
    const parentSpanId = otlpSpan.parentSpanId
      ? this.hexToUuid() || otlpSpan.parentSpanId
      : null;

    // Convert timestamps (nanoseconds to Date)
    const startTime = this.nanoToDate(otlpSpan.startTimeUnixNano);
    const endTime = otlpSpan.endTimeUnixNano
      ? this.nanoToDate(otlpSpan.endTimeUnixNano)
      : null;

    // Convert attributes to flat JSON object
    const attributes = this.convertAttributes(otlpSpan.attributes || []);

    // Convert events to JSON array
    const events = (otlpSpan.events || []).map((event) => ({
      name: event.name,
      timestamp: this.nanoToDate(event.timeUnixNano).toISOString(),
      attributes: this.convertAttributes(event.attributes || []),
    }));

    // Check if span already exists (idempotency)
    const [existing] = await db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.spanId, spanId));

    if (existing) {
      this.logger.debug(`Span ${spanId} already exists, skipping insert`);
      return;
    }

    const span: InsertTraceSpan = {
      traceId,
      spanId,
      parentSpanId,
      name: otlpSpan.name,
      startTime,
      endTime,
      attributes,
      events,
      runId,
      organizationId,
    };

    await db.insert(traceSpans).values([span]);

    this.logger.debug(
      `Stored span ${spanId} (${otlpSpan.name}) for run ${runId}`
    );
  }

  /**
   * Extract runId from resource attributes
   */
  private extractRunId(attributes?: OtlpAttribute[]): string | null {
    if (!attributes) return null;

    for (const attr of attributes) {
      if (attr.key === 'evalops.run_id' && attr.value?.stringValue) {
        return attr.value.stringValue;
      }
    }

    return null;
  }

  /**
   * Convert OTLP attributes to flat JSON object
   */
  private convertAttributes(
    attributes: OtlpAttribute[]
  ): Record<string, OtlpAttributeJsonValue> {
    const result: Record<string, OtlpAttributeJsonValue> = {};

    for (const attr of attributes) {
      if (!attr.value) continue;

      const value = this.extractAttributeValue(attr.value);
      if (value !== undefined) {
        result[attr.key] = value;
      }
    }

    return result;
  }

  /**
   * Extract value from OTLP AttributeValue
   */
  private extractAttributeValue(
    value: OtlpAttributeValue
  ): OtlpAttributeJsonValue {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.intValue !== undefined) return BigInt(value.intValue).toString();
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.boolValue !== undefined) return value.boolValue;
    if (value.arrayValue?.values) {
      return value.arrayValue.values.map((v) => this.extractAttributeValue(v));
    }
    if (value.kvlistValue?.values) {
      const obj: Record<string, OtlpAttributeJsonValue> = {};
      for (const kv of value.kvlistValue.values) {
        if (kv.value) {
          obj[kv.key] = this.extractAttributeValue(kv.value);
        }
      }
      return obj;
    }
    if (value.bytesValue !== undefined) {
      return Buffer.from(value.bytesValue, 'base64').toString('utf-8');
    }
    return undefined;
  }

  /**
   * Convert nanoseconds (string) to Date
   */
  private nanoToDate(nano: string): Date {
    const nanoseconds = BigInt(nano);
    const milliseconds = Number(nanoseconds / BigInt(1_000_000));
    return new Date(milliseconds);
  }

  /**
   * Convert hex string to UUID format (if 32 chars, convert to UUID)
   * OTLP uses hex strings: trace_id is 32 hex chars, span_id is 16 hex chars
   * We store them as-is (hex strings) for compatibility with OTLP standard
   */
  private hexToUuid(): string | null {
    // For now, we'll store hex strings as-is
    // If needed in the future, we can convert 32-char hex to UUID format
    // OTLP standard uses hex, so keeping as hex is more compatible
    return null; // Return null to keep original hex string
  }

  /**
   * Count total spans in a resource span
   */
  private countSpans(resourceSpan: {
    scopeSpans: Array<{ spans: unknown[] }>;
  }): number {
    return resourceSpan.scopeSpans.reduce(
      (sum, scope) => sum + scope.spans.length,
      0
    );
  }
}
