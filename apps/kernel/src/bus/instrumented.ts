import { SpanKind, context } from '@opentelemetry/api';
import type { KernelEvent } from '@vfos/sdk';
import { instruments } from '../telemetry/instruments.js';
import { extractCarrier, injectCurrent, type TraceCarrier } from '../telemetry/propagation.js';
import { withSpan } from '../telemetry/tracer.js';
import type { EventBus, EventHandler, PublishParams } from './types.js';

interface CarriedPayload {
  _trace_carrier?: TraceCarrier;
}

export class InstrumentedBus implements EventBus {
  readonly name: string;

  constructor(private readonly inner: EventBus) {
    this.name = inner.name;
  }

  async start(): Promise<void> {
    return this.inner.start();
  }

  async stop(): Promise<void> {
    return this.inner.stop();
  }

  async publish<T>(params: PublishParams<T>): Promise<KernelEvent<T>> {
    const m = instruments();
    return withSpan(
      `bus.publish ${params.schema}`,
      {
        kind: SpanKind.PRODUCER,
        attributes: {
          'vfos.event.schema': params.schema,
          'vfos.event.emitter': params.emitter,
          'vfos.tenant_id': params.tenant_id,
          'messaging.system': this.inner.name,
        },
      },
      async (span) => {
        const carrier = injectCurrent();
        const payload =
          params.payload && typeof params.payload === 'object'
            ? ({ ...(params.payload as Record<string, unknown>), _trace_carrier: carrier } as T)
            : params.payload;
        const enriched: PublishParams<T> = { ...params, payload };
        const result = await this.inner.publish(enriched);
        span.setAttribute('vfos.event.id', result.event_id);
        m.event_published_total.add(1, { schema: params.schema, bus: this.inner.name });
        return result;
      },
    );
  }

  subscribe<T = unknown>(schema: string, handler: EventHandler<T>): () => void {
    const m = instruments();
    const wrapped: EventHandler<T> = async (event) => {
      const payload = event.payload as CarriedPayload | undefined;
      const parentCtx = extractCarrier(payload?._trace_carrier ?? undefined);
      return context.with(parentCtx, () =>
        withSpan(
          `bus.handle ${schema}`,
          {
            kind: SpanKind.CONSUMER,
            attributes: {
              'vfos.event.schema': schema,
              'vfos.event.id': event.event_id,
              'vfos.event.emitter': event.emitter,
              'vfos.tenant_id': event.tenant_id,
              'messaging.system': this.inner.name,
            },
          },
          async () => {
            try {
              await handler(event);
              m.event_handled_total.add(1, { schema, bus: this.inner.name, status: 'ok' });
            } catch (err) {
              m.event_handled_total.add(1, { schema, bus: this.inner.name, status: 'error' });
              throw err;
            }
          },
        ),
      );
    };
    return this.inner.subscribe(schema, wrapped);
  }

  subscribeAll(handler: EventHandler): () => void {
    // No span wrapping for wildcards — the schema-specific bus.handle span
    // already captures them. The webhook dispatcher creates its own
    // outbound HTTP span when it fires.
    return this.inner.subscribeAll(handler);
  }

  getRecentEvents(limit?: number): readonly KernelEvent[] {
    return this.inner.getRecentEvents(limit);
  }
}
