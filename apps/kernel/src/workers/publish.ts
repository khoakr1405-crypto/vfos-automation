import { ulid } from 'ulid';
import type { Logger } from 'pino';
import type { EventBus } from '../bus/types.js';
import type { JobQueue } from '../queue/types.js';
import type { SyscallRegistry } from '../syscall-registry.js';

export interface PublishJobData {
  platform: 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'threads';
  account_id: string;
  caption: string;
  hashtags?: string[];
  privacy?: 'public' | 'unlisted' | 'private';
  video_url?: string;
  asset_id?: string;
  tenant_id?: string;
  trace_id?: string;
}

const SYSCALL_BY_PLATFORM: Record<PublishJobData['platform'], string> = {
  tiktok: 'publish.tiktok',
  facebook: 'publish.facebook.reels',
  instagram: 'publish.facebook.reels',
  youtube: 'publish.tiktok',
  threads: 'publish.facebook.reels',
};

export async function registerPublishWorker(
  queue: JobQueue,
  bus: EventBus,
  syscalls: SyscallRegistry,
  logger: Logger,
  defaultTenantId: string,
): Promise<void> {
  await queue.registerWorker<PublishJobData>(
    'vfos.publish',
    async ({ job, data }) => {
      const tenant_id = data.tenant_id ?? defaultTenantId;
      const trace_id = data.trace_id ?? ulid();
      const name = SYSCALL_BY_PLATFORM[data.platform];
      if (!name) throw new Error(`publish.worker: no syscall for platform ${data.platform}`);
      logger.info(
        { job_id: job.id, platform: data.platform, account_id: data.account_id },
        'publish.start',
      );
      try {
        const result = await syscalls.invoke<{ publish_id: string; status: string }>(
          name,
          { tenant_id, trace_id, caller: `worker:publish/${job.id}`, logger },
          {
            account_id: data.account_id,
            caption: data.caption,
            hashtags: data.hashtags ?? [],
            privacy: data.privacy ?? 'private',
            ...(data.video_url ? { video_url: data.video_url } : {}),
            ...(data.asset_id ? { asset_id: data.asset_id } : {}),
          },
          ['publish.write'],
        );
        logger.info(
          {
            job_id: job.id,
            platform: data.platform,
            publish_id: result.publish_id,
            status: result.status,
          },
          'publish.ok',
        );
        return { publish_id: result.publish_id, status: result.status };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ job_id: job.id, err: message }, 'publish.err');
        await bus.publish({
          schema: 'publish.failed.v1',
          tenant_id,
          emitter: 'kernel:publish-worker',
          trace_id,
          payload: { platform: data.platform, account_id: data.account_id, error: message },
        });
        throw err;
      }
    },
    { concurrency: 2 },
  );
}
