import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { ulid } from 'ulid';
import type { KernelEvent } from '@vfos/sdk';
import type { EventBus, EventHandler, PublishParams } from './types.js';

interface RedisBusOpts {
  url: string;
  consumerGroup?: string;
  consumerName?: string;
  blockMs?: number;
  batchSize?: number;
  historyLimit?: number;
}

const STREAM_PREFIX = 'vfos:ev:';
const DLQ_STREAM = 'vfos:dlq';
const MAX_DELIVERY = 3;

export class RedisBus implements EventBus {
  readonly name = 'redis';
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly subscribers = new Map<string, Set<EventHandler<unknown>>>();
  private readonly wildcardHandlers = new Set<EventHandler>();
  private readonly consumers = new Map<string, AbortController>();
  private readonly history: KernelEvent[] = [];
  private readonly group: string;
  private readonly consumer: string;
  private readonly blockMs: number;
  private readonly batchSize: number;
  private readonly historyLimit: number;

  constructor(
    private readonly logger: Logger,
    private readonly opts: RedisBusOpts,
  ) {
    this.publisher = new Redis(opts.url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.subscriber = new Redis(opts.url, { maxRetriesPerRequest: null, lazyConnect: true });
    this.group = opts.consumerGroup ?? 'kernel';
    this.consumer = opts.consumerName ?? `kernel-${process.pid}`;
    this.blockMs = opts.blockMs ?? 1500;
    this.batchSize = opts.batchSize ?? 16;
    this.historyLimit = opts.historyLimit ?? 1000;
  }

  async start(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    this.logger.info({ url: this.redactUrl(this.opts.url) }, 'bus.redis.start');
  }

  async stop(): Promise<void> {
    for (const ac of this.consumers.values()) ac.abort();
    this.consumers.clear();
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
    this.logger.info('bus.redis.stop');
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
    const stream = STREAM_PREFIX + params.schema;
    await this.publisher.xadd(
      stream,
      'MAXLEN',
      '~',
      '10000',
      '*',
      'payload',
      JSON.stringify(event),
    );
    this.recordHistory(event);
    this.logger.debug({ event_id: event.event_id, schema: event.schema }, 'bus.publish');
    return event;
  }

  subscribe<T = unknown>(schema: string, handler: EventHandler<T>): () => void {
    let set = this.subscribers.get(schema);
    if (!set) {
      set = new Set();
      this.subscribers.set(schema, set);
      this.spawnConsumerLoop(schema);
    }
    set.add(handler as EventHandler<unknown>);
    return () => set?.delete(handler as EventHandler<unknown>);
  }

  subscribeAll(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  getRecentEvents(limit = 50): readonly KernelEvent[] {
    return this.history.slice(-limit);
  }

  private spawnConsumerLoop(schema: string): void {
    const stream = STREAM_PREFIX + schema;
    const ac = new AbortController();
    this.consumers.set(schema, ac);
    void this.consumerLoop(schema, stream, ac.signal).catch((err) => {
      this.logger.error({ err, schema }, 'bus.redis.consumer.crashed');
    });
  }

  private async consumerLoop(
    schema: string,
    stream: string,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.subscriber.xgroup('CREATE', stream, this.group, '$', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !/BUSYGROUP/.test(err.message)) throw err;
    }
    while (!signal.aborted) {
      const res = (await this.subscriber.xreadgroup(
        'GROUP',
        this.group,
        this.consumer,
        'COUNT',
        this.batchSize,
        'BLOCK',
        this.blockMs,
        'STREAMS',
        stream,
        '>',
      )) as [string, [string, string[]][]][] | null;
      if (!res) continue;
      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          await this.handleEntry(schema, stream, id, fields);
        }
      }
    }
  }

  private async handleEntry(
    schema: string,
    stream: string,
    id: string,
    fields: string[],
  ): Promise<void> {
    const idx = fields.indexOf('payload');
    if (idx < 0 || idx + 1 >= fields.length) {
      await this.subscriber.xack(stream, this.group, id);
      return;
    }
    let event: KernelEvent;
    try {
      event = JSON.parse(fields[idx + 1] as string) as KernelEvent;
    } catch (err) {
      this.logger.error({ err, id, schema }, 'bus.redis.payload.invalid');
      await this.subscriber.xack(stream, this.group, id);
      return;
    }
    this.recordHistory(event);

    // Fire wildcard handlers independently — their failures don't gate ack
    // since they're not part of the schema's consumer group contract.
    for (const w of this.wildcardHandlers) {
      try {
        await w(event);
      } catch (err) {
        this.logger.error({ err, schema, id }, 'bus.redis.wildcard.error');
      }
    }

    const set = this.subscribers.get(schema);
    if (!set || set.size === 0) {
      await this.subscriber.xack(stream, this.group, id);
      return;
    }
    let allOk = true;
    for (const h of set) {
      try {
        await h(event);
      } catch (err) {
        allOk = false;
        this.logger.error({ err, schema, id }, 'bus.redis.subscriber.error');
      }
    }
    if (allOk) {
      await this.subscriber.xack(stream, this.group, id);
    } else {
      const pending = (await this.subscriber.xpending(
        stream,
        this.group,
        'IDLE',
        0,
        '-',
        '+',
        10,
        this.consumer,
      )) as unknown[];
      const entry = (pending as [string, string, number, number][]).find((p) => p[0] === id);
      const deliveries = entry ? entry[3] : 1;
      if (deliveries >= MAX_DELIVERY) {
        await this.publisher.xadd(
          DLQ_STREAM,
          '*',
          'origin_stream',
          stream,
          'origin_id',
          id,
          'payload',
          JSON.stringify(event),
        );
        await this.subscriber.xack(stream, this.group, id);
        this.logger.warn({ id, schema, deliveries }, 'bus.redis.dlq.move');
      }
    }
  }

  private recordHistory(event: KernelEvent): void {
    this.history.push(event);
    if (this.history.length > this.historyLimit) this.history.shift();
  }

  private redactUrl(url: string): string {
    return url.replace(/:[^:@/]+@/, ':***@');
  }
}
