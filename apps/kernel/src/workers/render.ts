import type { Logger } from 'pino';
import { setTimeout as sleep } from 'node:timers/promises';
import type { EventBus } from '../bus/types.js';
import type { JobQueue } from '../queue/types.js';

export interface RenderJobData {
  asset_id: string;
  niche: string;
  region: string;
  duration_ms?: number;
  futs_score?: number;
  matched_sku?: string;
  tenant_id?: string;
  trace_id?: string;
}

export async function registerRenderWorker(
  queue: JobQueue,
  bus: EventBus,
  logger: Logger,
): Promise<void> {
  await queue.registerWorker<RenderJobData>(
    'vfos.render',
    async ({ job, data }) => {
      const start = performance.now();
      const target_ms = Math.max(50, data.duration_ms ?? 200);
      logger.info(
        { job_id: job.id, asset_id: data.asset_id, niche: data.niche },
        'render.start',
      );
      await sleep(target_ms);
      const elapsed = Math.round(performance.now() - start);
      await bus.publish({
        schema: 'render.completed.v1',
        tenant_id: data.tenant_id ?? '00000000-0000-0000-0000-000000000001',
        emitter: 'kernel:render-worker',
        ...(data.trace_id ? { trace_id: data.trace_id } : {}),
        payload: {
          job_id: job.id,
          asset_id: data.asset_id,
          niche: data.niche,
          region: data.region,
          render_ms: elapsed,
          futs_score: data.futs_score ?? null,
          matched_sku: data.matched_sku ?? null,
        },
      });
      logger.info(
        { job_id: job.id, asset_id: data.asset_id, ms: elapsed },
        'render.completed',
      );
      return { asset_id: data.asset_id, render_ms: elapsed };
    },
    { concurrency: 3 },
  );
}
