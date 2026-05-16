import type { ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';
import { BullMQQueue } from './bullmq.js';
import { InstrumentedQueue } from './instrumented.js';
import { InMemoryQueue } from './memory.js';
import type { JobQueue } from './types.js';

export interface QueueFactoryOpts {
  redisUrl?: string;
}

export async function createQueue(logger: Logger, opts: QueueFactoryOpts): Promise<JobQueue> {
  let inner: JobQueue;
  if (opts.redisUrl) {
    const connection = parseRedisUrl(opts.redisUrl);
    inner = new BullMQQueue(logger, connection);
  } else {
    inner = new InMemoryQueue(logger);
  }
  await inner.start();
  return new InstrumentedQueue(inner);
}

function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const conn: ConnectionOptions = {
    host: u.hostname,
    port: Number(u.port || 6379),
  };
  if (u.password) conn.password = decodeURIComponent(u.password);
  if (u.username && u.username !== 'default') conn.username = decodeURIComponent(u.username);
  if (u.pathname.length > 1) conn.db = Number(u.pathname.slice(1));
  return conn;
}

export { InMemoryQueue, BullMQQueue };
export type { JobQueue };
