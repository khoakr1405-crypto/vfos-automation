import type { Logger } from 'pino';
import { ulid } from 'ulid';
import type {
  EnqueueOpts,
  EnqueueResult,
  JobContext,
  JobHandler,
  JobQueue,
  QueueStats,
} from './types.js';

interface JobRecord<T = unknown> {
  id: string;
  name: string;
  queue: string;
  data: T;
  priority: number;
  attempts_made: number;
  enqueued_at: number;
  state: 'waiting' | 'active' | 'completed' | 'failed';
}

interface QueueState {
  jobs: JobRecord[];
  handler: JobHandler<unknown> | null;
  concurrency: number;
  active: Set<string>;
  completed: number;
  failed: number;
}

export class InMemoryQueue implements JobQueue {
  readonly name = 'memory';
  private readonly queues = new Map<string, QueueState>();
  private stopped = false;

  constructor(private readonly logger: Logger) {}

  async start(): Promise<void> {
    this.logger.info('queue.memory.start');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.logger.info('queue.memory.stop');
  }

  async enqueue<T>(
    queue: string,
    jobName: string,
    data: T,
    opts: EnqueueOpts = {},
  ): Promise<EnqueueResult> {
    const state = this.getQueue(queue);
    const job: JobRecord<T> = {
      id: ulid(),
      name: jobName,
      queue,
      data,
      priority: opts.priority ?? 5,
      attempts_made: 0,
      enqueued_at: Date.now(),
      state: 'waiting',
    };
    state.jobs.push(job as JobRecord);
    state.jobs.sort((a, b) => a.priority - b.priority || a.enqueued_at - b.enqueued_at);
    setImmediate(() => void this.drain(queue));
    return { job_id: job.id, queue };
  }

  async registerWorker<T>(
    queue: string,
    handler: JobHandler<T>,
    opts: { concurrency?: number } = {},
  ): Promise<void> {
    const state = this.getQueue(queue);
    state.handler = handler as JobHandler<unknown>;
    state.concurrency = opts.concurrency ?? 2;
    setImmediate(() => void this.drain(queue));
  }

  async stats(queue: string): Promise<QueueStats> {
    const s = this.getQueue(queue);
    return {
      queue,
      waiting: s.jobs.filter((j) => j.state === 'waiting').length,
      active: s.active.size,
      completed: s.completed,
      failed: s.failed,
      delayed: 0,
    };
  }

  private getQueue(name: string): QueueState {
    let s = this.queues.get(name);
    if (!s) {
      s = {
        jobs: [],
        handler: null,
        concurrency: 2,
        active: new Set(),
        completed: 0,
        failed: 0,
      };
      this.queues.set(name, s);
    }
    return s;
  }

  private async drain(name: string): Promise<void> {
    if (this.stopped) return;
    const state = this.queues.get(name);
    if (!state || !state.handler) return;
    while (state.active.size < state.concurrency) {
      const next = state.jobs.find((j) => j.state === 'waiting');
      if (!next) break;
      next.state = 'active';
      state.active.add(next.id);
      void this.runJob(name, next, state);
    }
  }

  private async runJob(name: string, job: JobRecord, state: QueueState): Promise<void> {
    job.attempts_made += 1;
    const ctx: JobContext<unknown> = {
      job: {
        id: job.id,
        name: job.name,
        queue: name,
        attempts_made: job.attempts_made,
        enqueued_at: job.enqueued_at,
      },
      data: job.data,
    };
    try {
      await state.handler?.(ctx);
      job.state = 'completed';
      state.completed += 1;
    } catch (err) {
      this.logger.error({ err, job_id: job.id, queue: name }, 'queue.memory.job.failed');
      job.state = 'failed';
      state.failed += 1;
    } finally {
      state.active.delete(job.id);
      setImmediate(() => void this.drain(name));
    }
  }
}
