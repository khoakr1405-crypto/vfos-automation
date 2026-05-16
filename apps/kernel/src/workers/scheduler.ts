import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import { ulid } from 'ulid';
import { scheduled_pipelines } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import type { JobQueue } from '../queue/types.js';
import type { SyscallRegistry } from '../syscall-registry.js';

export interface SchedulerJobData {
  schedule_id: string;
  tenant_id: string;
  args: Record<string, unknown>;
  trace_id?: string;
}

export async function registerSchedulerWorker(
  queue: JobQueue,
  db: DbHandle,
  syscalls: SyscallRegistry,
  logger: Logger,
): Promise<void> {
  await queue.registerWorker<SchedulerJobData>(
    'vfos.scheduler',
    async ({ job, data }) => {
      const trace_id = data.trace_id ?? ulid();
      logger.info(
        { job_id: job.id, schedule_id: data.schedule_id, tenant_id: data.tenant_id },
        'scheduler.run.start',
      );
      try {
        const result = await syscalls.invoke<{
          trace_id: string;
          final: string;
          reason?: string;
        }>(
          'pipeline.run',
          {
            tenant_id: data.tenant_id,
            trace_id,
            caller: `worker:scheduler/${job.id}`,
            logger,
          },
          data.args,
          ['tenant.admin'],
        );
        await db
          .update(scheduled_pipelines)
          .set({
            last_status: result.final,
            last_trace_id: result.trace_id,
            last_error: result.reason ?? null,
          })
          .where(eq(scheduled_pipelines.id, data.schedule_id));
        logger.info(
          { job_id: job.id, schedule_id: data.schedule_id, final: result.final },
          'scheduler.run.done',
        );
        return { final: result.final, trace_id: result.trace_id };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(scheduled_pipelines)
          .set({ last_status: 'failed', last_error: message })
          .where(eq(scheduled_pipelines.id, data.schedule_id));
        logger.error({ err: message, schedule_id: data.schedule_id }, 'scheduler.run.err');
        throw err;
      }
    },
    { concurrency: 2 },
  );
}
