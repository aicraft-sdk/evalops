/**
 * OTLP DTOs for HTTP/JSON format (protobuf JSON encoding)
 *
 * Based on OpenTelemetry Protocol (OTLP) specification:
 * https://github.com/open-telemetry/opentelemetry-proto
 */

/**
 * OTLP Attribute Value - can be string, int, double, bool, or array/object
 */
export interface OtlpAttributeValue {
  stringValue?: string;
  intValue?: string; // int64 as string
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: {
    values?: OtlpAttributeValue[];
  };
  kvlistValue?: {
    values?: Array<{
      key: string;
      value?: OtlpAttributeValue;
    }>;
  };
  bytesValue?: string; // base64 encoded
}

/**
 * OTLP Span Event
 */
export interface OtlpSpanEvent {
  timeUnixNano: string; // uint64 as string
  name: string;
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * OTLP Span Link
 */
export interface OtlpSpanLink {
  traceId: string; // bytes as hex string
  spanId: string; // bytes as hex string
  traceState?: string;
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * OTLP Attribute
 */
export interface OtlpAttribute {
  key: string;
  value?: OtlpAttributeValue;
}

/**
 * OTLP Span Status
 */
export interface OtlpStatus {
  message?: string;
  code?: 'STATUS_CODE_UNSET' | 'STATUS_CODE_OK' | 'STATUS_CODE_ERROR';
}

/**
 * OTLP Span
 */
export interface OtlpSpan {
  traceId: string; // bytes as hex string (16 bytes = 32 hex chars)
  spanId: string; // bytes as hex string (8 bytes = 16 hex chars)
  traceState?: string;
  parentSpanId?: string; // bytes as hex string
  name: string;
  kind?:
    | 'SPAN_KIND_UNSPECIFIED'
    | 'SPAN_KIND_INTERNAL'
    | 'SPAN_KIND_SERVER'
    | 'SPAN_KIND_CLIENT'
    | 'SPAN_KIND_PRODUCER'
    | 'SPAN_KIND_CONSUMER';
  startTimeUnixNano: string; // uint64 as string
  endTimeUnixNano?: string; // uint64 as string
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
  events?: OtlpSpanEvent[];
  droppedEventsCount?: number;
  links?: OtlpSpanLink[];
  droppedLinksCount?: number;
  status?: OtlpStatus;
}

/**
 * OTLP InstrumentationScope
 */
export interface OtlpInstrumentationScope {
  name?: string;
  version?: string;
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * OTLP ScopeSpans
 */
export interface OtlpScopeSpans {
  scope?: OtlpInstrumentationScope;
  spans: OtlpSpan[];
  schemaUrl?: string;
}

/**
 * OTLP Resource Attributes
 */
export interface OtlpResourceAttributes {
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * OTLP ResourceSpans
 */
export interface OtlpResourceSpans {
  resource?: OtlpResourceAttributes;
  scopeSpans: OtlpScopeSpans[];
  schemaUrl?: string;
}

/**
 * OTLP ExportTraceServiceRequest
 */
export interface OtlpExportTraceServiceRequest {
  resourceSpans: OtlpResourceSpans[];
}

/**
 * OTLP ExportTraceServiceResponse
 */
export interface OtlpExportTraceServiceResponse {
  partialSuccess?: {
    rejectedSpans?: number;
    errorMessage?: string;
  };
}
