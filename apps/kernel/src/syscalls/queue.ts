import { z } from 'zod';
import type { JobQueue } from '../queue/types.js';
import type { SyscallSpec } from '../syscall-registry.js';

const EnqueueInput = z.object({
  queue: z.string().min(1),
  job_name: z.string().min(1),
  data: z.record(z.unknown()),
  priority: z.number().int().min(1).max(10).optional(),
  delay_ms: z.number().int().nonnegative().optional(),
  attempts: z.number().int().min(1).max(10).optional(),
});

const StatsInput = z.object({
  queue: z.string().min(1),
});

const ALLOWED_QUEUES = new Set([
  'vfos.render',
  'vfos.publish',
  'vfos.attribution',
  'vfos.scheduler',
]);

export function makeQueueSyscalls(queue: JobQueue): readonly SyscallSpec[] {
  const enqueue: SyscallSpec = {
    name: 'queue.enqueue',
    description: 'Enqueue a job on a named priority queue.',
    requiredScope: 'queue.write',
    handler: async (ctx, raw) => {
      const args = EnqueueInput.parse(raw);
      if (!ALLOWED_QUEUES.has(args.queue)) {
        throw new Error(`queue not allowlisted: ${args.queue}`);
      }
      const opts: Parameters<JobQueue['enqueue']>[3] = {};
      if (args.priority !== undefined) opts.priority = args.priority;
      if (args.delay_ms !== undefined) opts.delayMs = args.delay_ms;
      if (args.attempts !== undefined) opts.attempts = args.attempts;
      const res = await queue.enqueue(
        args.queue,
        args.job_name,
        { ...args.data, tenant_id: ctx.tenant_id, trace_id: ctx.trace_id },
        opts,
      );
      return res;
    },
  };

  const stats: SyscallSpec = {
    name: 'queue.stats',
    description: 'Return active/waiting/completed/failed counts for a queue.',
    requiredScope: 'queue.read',
    handler: async (_ctx, raw) => {
      const args = StatsInput.parse(raw);
      return queue.stats(args.queue);
    },
  };

  return [enqueue, stats];
}
