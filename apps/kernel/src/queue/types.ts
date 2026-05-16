export interface EnqueueOpts {
  priority?: number;
  attempts?: number;
  delayMs?: number;
}

export interface EnqueueResult {
  job_id: string;
  queue: string;
}

export interface JobMeta {
  id: string;
  name: string;
  queue: string;
  attempts_made: number;
  enqueued_at: number;
}

export interface JobContext<T> {
  job: JobMeta;
  data: T;
}

export type JobHandler<T> = (ctx: JobContext<T>) => Promise<unknown>;

export interface QueueStats {
  queue: string;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface JobQueue {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  enqueue<T>(queue: string, jobName: string, data: T, opts?: EnqueueOpts): Promise<EnqueueResult>;
  registerWorker<T>(
    queue: string,
    handler: JobHandler<T>,
    opts?: { concurrency?: number },
  ): Promise<void>;
  stats(queue: string): Promise<QueueStats>;
}
