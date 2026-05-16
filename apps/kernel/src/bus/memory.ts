import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';
import { ulid } from 'ulid';
import type { KernelEvent } from '@vfos/sdk';
import type { EventBus, EventHandler, PublishParams } from './types.js';

export class InMemoryBus implements EventBus {
  readonly name = 'memory';
  private readonly emitter = new EventEmitter();
  private readonly wildcardHandlers = new Set<EventHandler>();
  private readonly history: KernelEvent[] = [];
  private readonly historyLimit = 1000;

  constructor(private readonly logger: Logger) {
    this.emitter.setMaxListeners(200);
  }

  async start(): Promise<void> {
    this.logger.info('bus.memory.start');
  }

  async stop(): Promise<void> {
    this.emitter.removeAllListeners();
    this.logger.info('bus.memory.stop');
  }

  async publish<T>(params: PublishParams<T>): Promise<KernelEvent<T>> {
    const event: KernelEvent<T> = {
      event_id: ulid(),
      trace_id: params.trace_id ?? ulid(),
      tenant_id: params.tenant_id,
      emitted_at: new Date().toISOString(),
      emitter: params.emitter,
      schema: params.schema,
      payload: params.payload,
      ...(params.meta ? { meta: params.meta } : {}),
    };
    this.recordHistory(event);
    this.logger.debug({ event_id: event.event_id, schema: event.schema }, 'bus.publish');
    this.emitter.emit(params.schema, event);
    for (const h of this.wildcardHandlers) {
      void this.dispatchWildcard(h, event);
    }
    return event;
  }

  private async dispatchWildcard(handler: EventHandler, event: KernelEvent): Promise<void> {
    try {
      await handler(event);
    } catch (err) {
      this.logger.error(
        { err, schema: event.schema, event_id: event.event_id },
        'bus.wildcard.error',
      );
    }
  }

  subscribe<T = unknown>(schema: string, handler: EventHandler<T>): () => void {
    const wrapped = async (event: KernelEvent<unknown>): Promise<void> => {
      try {
        await handler(event as KernelEvent<T>);
      } catch (err) {
        this.logger.error(
          { err, schema, event_id: event.event_id },
          'bus.subscriber.error',
        );
      }
    };
    this.emitter.on(schema, wrapped);
    return () => this.emitter.off(schema, wrapped);
  }

  subscribeAll(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  getRecentEvents(limit = 50): readonly KernelEvent[] {
    return this.history.slice(-limit);
  }

  private recordHistory(event: KernelEvent): void {
    this.history.push(event);
    if (this.history.length > this.historyLimit) this.history.shift();
  }
}
