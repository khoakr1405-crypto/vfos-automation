import { SpanKind, context } from '@opentelemetry/api';
import { instruments } from '../telemetry/instruments.js';
import { extractCarrier, injectCurrent, type TraceCarrier } from '../telemetry/propagation.js';
import { withSpan } from '../telemetry/tracer.js';
import type {
  EnqueueOpts,
  EnqueueResult,
  JobContext,
  JobHandler,
  JobQueue,
  QueueStats,
} from './types.js';

interface CarriedData {
  _trace_carrier?: TraceCarrier;
}

export class InstrumentedQueue implements JobQueue {
  readonly name: string;

  constructor(private readonly inner: JobQueue) {
    this.name = inner.name;
  }

  async start(): Promise<void> {
    return this.inner.start();
  }

  async stop(): Promise<void> {
    return this.inner.stop();
  }

  async enqueue<T>(
    queue: string,
    jobName: string,
    data: T,
    opts?: EnqueueOpts,
  ): Promise<EnqueueResult> {
    const m = instruments();
    return withSpan(
      `queue.enqueue ${queue}`,
      {
        kind: SpanKind.PRODUCER,
        attributes: {
          'vfos.queue.name': queue,
          'vfos.queue.job_name': jobName,
          'messaging.system': this.inner.name,
        },
      },
      async (span) => {
        const carrier = injectCurrent();
        const enriched =
          data && typeof data === 'object'
            ? ({ ...(data as Record<string, unknown>), _trace_carrier: carrier } as T)
            : data;
        const result = await this.inner.enqueue(queue, jobName, enriched, opts);
        span.setAttribute('vfos.queue.job_id', result.job_id);
        m.queue_enqueued_total.add(1, { queue, impl: this.inner.name });
        return result;
      },
    );
  }

  async registerWorker<T>(
    queue: string,
    handler: JobHandler<T>,
    opts?: { concurrency?: number },
  ): Promise<void> {
    const wrapped: JobHandler<T> = async (jobCtx: JobContext<T>) => {
      const m = instruments();
      const carried = jobCtx.data as CarriedData | undefined;
      const parentCtx = extractCarrier(carried?._trace_carrier ?? undefined);
      return context.with(parentCtx, () =>
        withSpan(
          `queue.job ${queue}`,
          {
            kind: SpanKind.CONSUMER,
            attributes: {
              'vfos.queue.name': queue,
              'vfos.queue.job_id': jobCtx.job.id,
              'vfos.queue.job_name': jobCtx.job.name,
              'vfos.queue.attempts': jobCtx.job.attempts_made,
              'messaging.system': this.inner.name,
            },
          },
          async () => {
            const start = performance.now();
            try {
              const out = await handler(jobCtx);
              const ms = Math.round(performance.now() - start);
              m.queue_job_total.add(1, { queue, status: 'ok' });
              m.queue_job_duration_ms.record(ms, { queue });
              return out;
            } catch (err) {
              const ms = Math.round(performance.now() - start);
              m.queue_job_total.add(1, { queue, status: 'error' });
              m.queue_job_duration_ms.record(ms, { queue });
              throw err;
            }
          },
        ),
      );
    };
    return this.inner.registerWorker(queue, wrapped, opts);
  }

  async stats(queue: string): Promise<QueueStats> {
    return this.inner.stats(queue);
  }
}
