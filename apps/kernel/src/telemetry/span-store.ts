import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * Capped in-memory span exporter. Keeps the last N finished spans so the
 * cockpit can render recent traces without a full Tempo/Jaeger stack.
 *
 * For production: stack this exporter alongside an OTLP exporter so
 * persistent backends keep history; the in-memory store remains useful
 * for ad-hoc debugging inside the cockpit.
 */
export class CappedSpanStore implements SpanExporter {
  private readonly spans: ReadableSpan[] = [];

  constructor(private readonly capacity: number = 2000) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const s of spans) this.spans.push(s);
    if (this.spans.length > this.capacity) {
      this.spans.splice(0, this.spans.length - this.capacity);
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    this.spans.length = 0;
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  getRecent(limit?: number): readonly ReadableSpan[] {
    if (typeof limit !== 'number') return [...this.spans];
    if (limit >= this.spans.length) return [...this.spans];
    return this.spans.slice(-limit);
  }

  size(): number {
    return this.spans.length;
  }
}
