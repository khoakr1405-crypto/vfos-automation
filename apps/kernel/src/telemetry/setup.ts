import { metrics, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { PrometheusExporter, PrometheusSerializer } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { CappedSpanStore } from './span-store.js';

let exporter: PrometheusExporter | null = null;
const serializer = new PrometheusSerializer();
let tracerProvider: BasicTracerProvider | null = null;
let spanStore: CappedSpanStore | null = null;

export function setupTelemetry(): void {
  if (exporter) return;

  const resource = new Resource({
    'service.name': 'vfos-kernel',
    'service.version': '0.9.0',
  });

  exporter = new PrometheusExporter({ preventServerStart: true });
  const meterProvider = new MeterProvider({ resource, readers: [exporter] });
  metrics.setGlobalMeterProvider(meterProvider);

  spanStore = new CappedSpanStore(2000);
  tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(spanStore)],
  });
  // register() wires the global tracer + W3C propagator + context manager.
  tracerProvider.register({ contextManager: new AsyncHooksContextManager().enable() });
  trace.setGlobalTracerProvider(tracerProvider);
}

export async function getMetricsText(): Promise<string> {
  if (!exporter) return '# telemetry not initialized\n';
  const collection = await exporter.collect();
  return serializer.serialize(collection.resourceMetrics);
}

export function getRecentSpans(limit?: number): readonly ReadableSpan[] {
  if (!spanStore) return [];
  return spanStore.getRecent(limit);
}

export function getSpanStoreSize(): number {
  return spanStore?.size() ?? 0;
}

export async function shutdownTelemetry(): Promise<void> {
  if (exporter) await exporter.shutdown();
  if (tracerProvider) await tracerProvider.shutdown();
  exporter = null;
  tracerProvider = null;
  spanStore = null;
}
