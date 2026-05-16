import { and, eq, lte } from 'drizzle-orm';
import type { Logger } from 'pino';
import { ulid } from 'ulid';
import { scheduled_pipelines } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import type { JobQueue } from '../queue/types.js';
import { instruments } from '../telemetry/instruments.js';
import { nextRunAt, parseCron } from './cron.js';

const DEFAULT_INTERVAL_MS = 30_000;

export interface SchedulerLoopOpts {
  intervalMs?: number;
}

export interface SchedulerLoop {
  start(): void;
  stop(): Promise<void>;
  /** Force a single tick — exposed for tests to skip the wait. */
  tickOnce(): Promise<number>;
}

export function createSchedulerLoop(
  db: DbHandle,
  queue: JobQueue,
  logger: Logger,
  opts: SchedulerLoopOpts = {},
): SchedulerLoop {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = false;

  async function tick(): Promise<number> {
    if (running) return 0;
    running = true;
    let fired = 0;
    try {
      const now = new Date();
      const due = await db
        .select()
        .from(scheduled_pipelines)
        .where(
          and(
            eq(scheduled_pipelines.enabled, 1),
            lte(scheduled_pipelines.next_run_at, now),
          ),
        );
      for (const row of due) {
        let next: Date | null = null;
        try {
          next = nextRunAt(parseCron(row.cron_expr), now);
        } catch (err) {
          logger.error(
            { err, schedule_id: row.id, cron: row.cron_expr },
            'scheduler.invalid_cron',
          );
        }
        // Advance next_run_at BEFORE enqueueing so a slow worker can't be
        // re-enqueued on the next tick.
        await db
          .update(scheduled_pipelines)
          .set({
            next_run_at: next ?? new Date(now.getTime() + 24 * 3600 * 1000),
            last_run_at: now,
            last_status: 'queued',
            last_error: null,
          })
          .where(eq(scheduled_pipelines.id, row.id));

        await queue.enqueue(
          'vfos.scheduler',
          'scheduler.run',
          {
            schedule_id: row.id,
            tenant_id: row.tenant_id,
            args: row.args,
            trace_id: ulid(),
          },
          { priority: 5 },
        );
        fired += 1;
        instruments().scheduler_runs_total.add(1, { tenant_id: row.tenant_id });
      }
      if (fired > 0) logger.info({ fired }, 'scheduler.fired');
    } catch (err) {
      logger.error({ err }, 'scheduler.tick.error');
    } finally {
      running = false;
    }
    return fired;
  }

  function arm(): void {
    if (stopped) return;
    timer = setTimeout(async () => {
      await tick();
      arm();
    }, intervalMs);
    timer.unref?.();
  }

  return {
    start() {
      stopped = false;
      logger.info({ intervalMs }, 'scheduler.start');
      // Fire immediately on boot to catch anything overdue, then resume cadence.
      void tick().then(arm);
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Wait for any in-flight tick to drain.
      while (running) await new Promise((r) => setTimeout(r, 25));
      logger.info('scheduler.stop');
    },
    tickOnce: tick,
  };
}
