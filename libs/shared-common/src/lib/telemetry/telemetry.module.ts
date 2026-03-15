import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * OpenTelemetry NestJS module.
 *
 * The SDK is initialized via initTelemetry() which MUST be called in each
 * service's main.ts BEFORE bootstrapping NestJS, so that auto-instrumentation
 * patches modules before they are imported.
 *
 * Required env vars:
 *   OTEL_SERVICE_NAME          - Logical service name (e.g., "core-service")
 *   OTEL_EXPORTER_OTLP_ENDPOINT - OTLP gRPC endpoint (e.g., "http://jaeger:4317")
 */
export function initTelemetry(serviceName?: string): void {
  try {
    // Dynamic require so tree-shaking doesn't strip in non-Node builds
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');

    const name =
      serviceName ??
      process.env['OTEL_SERVICE_NAME'] ??
      'evalops-service';

    const exporterEndpoint =
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4317';

    const sdk = new NodeSDK({
      serviceName: name,
      traceExporter: new OTLPTraceExporter({ url: exporterEndpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();

    process.on('SIGTERM', () => {
      sdk.shutdown().finally(() => process.exit(0));
    });
  } catch (err) {
    // Non-fatal — telemetry should not crash the service
    console.warn('[Telemetry] Failed to initialize OpenTelemetry:', err);
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  exports: [],
})
export class TelemetryModule {}
