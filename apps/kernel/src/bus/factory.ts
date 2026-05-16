import type { Logger } from 'pino';
import { InstrumentedBus } from './instrumented.js';
import { InMemoryBus } from './memory.js';
import { RedisBus } from './redis.js';
import type { EventBus } from './types.js';

export interface BusFactoryOpts {
  redisUrl?: string;
}

export async function createBus(logger: Logger, opts: BusFactoryOpts): Promise<EventBus> {
  const inner: EventBus = opts.redisUrl
    ? new RedisBus(logger, { url: opts.redisUrl })
    : new InMemoryBus(logger);
  await inner.start();
  return new InstrumentedBus(inner);
}

export { InMemoryBus, RedisBus };
export type { EventBus };
