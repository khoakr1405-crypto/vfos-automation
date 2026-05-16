import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';
import type {
  EnqueueOpts,
  EnqueueResult,
  JobHandler,
  JobQueue,
  QueueStats,
} from './types.js';

export class BullMQQueue implements JobQueue {
  readonly name = 'bullmq';
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor(
    private readonly logger: Logger,
    private readonly connection: ConnectionOptions,
  ) {}

  async start(): Promise<void> {
    this.logger.info('queue.bullmq.start');
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.workers.values()].map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    this.workers.clear();
    this.queues.clear();
    this.logger.info('queue.bullmq.stop');
  }

  async enqueue<T>(
    queue: string,
    jobName: string,
    data: T,
    opts: EnqueueOpts = {},
  ): Promise<EnqueueResult> {
    const q = this.getQueue(queue);
    const jobOpts: Parameters<typeof q.add>[2] = {
      priority: opts.priority ?? 5,
      attempts: opts.attempts ?? 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    };
    if (opts.delayMs !== undefined) jobOpts.delay = opts.delayMs;
    const job = await q.add(jobName, data, jobOpts);
    return { job_id: String(job.id ?? ''), queue };
  }

  async registerWorker<T>(
    queue: string,
    handler: JobHandler<T>,
    opts: { concurrency?: number } = {},
  ): Promise<void> {
    if (this.workers.has(queue)) {
      throw new Error(`worker already registered for queue ${queue}`);
    }
    const worker = new Worker<T>(
      queue,
      async (job: Job<T>) => {
        const result = await handler({
          job: {
            id: String(job.id ?? ''),
            name: job.name,
            queue,
            attempts_made: job.attemptsMade,
            enqueued_at: job.timestamp,
          },
          data: job.data,
        });
        return result;
      },
      { connection: this.connection, concurrency: opts.concurrency ?? 2 },
    );
    worker.on('failed', (job, err) => {
      this.logger.error(
        { err, job_id: job?.id, queue, attempts: job?.attemptsMade },
        'queue.bullmq.job.failed',
      );
    });
    this.workers.set(queue, worker);
  }

  async stats(queue: string): Promise<QueueStats> {
    const q = this.getQueue(queue);
    const counts = await q.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
    return {
      queue,
      active: counts.active ?? 0,
      waiting: counts.waiting ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
  }

  private getQueue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q;
  }
}
