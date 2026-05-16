import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scheduled_pipelines } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import { nextRunAt, parseCron, validateCron } from '../scheduler/cron.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface SchedulerSyscallDeps {
  db: DbHandle;
}

const PIPELINE_ARGS = z
  .object({
    source_url: z.string().url().optional(),
    target_platform: z.enum(['tiktok', 'facebook']).optional(),
    caption: z.string().max(2000).optional(),
    transcript: z.string().optional(),
    niche_hint: z.string().optional(),
    privacy: z.enum(['public', 'unlisted', 'private']).optional(),
  })
  .passthrough();

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  cron_expr: z.string().min(3).max(120),
  args: PIPELINE_ARGS.default({}),
  enabled: z.boolean().default(true),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  cron_expr: z.string().min(3).max(120).optional(),
  args: PIPELINE_ARGS.optional(),
  enabled: z.boolean().optional(),
});

const IdInput = z.object({ id: z.string().uuid() });

function redact(row: typeof scheduled_pipelines.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    cron_expr: row.cron_expr,
    args: row.args,
    enabled: row.enabled === 1,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at,
    last_status: row.last_status,
    last_trace_id: row.last_trace_id,
    last_error: row.last_error,
    created_at: row.created_at,
    created_by: row.created_by,
  };
}

export function makeSchedulerSyscalls(deps: SchedulerSyscallDeps): readonly SyscallSpec[] {
  const create: SyscallSpec = {
    name: 'scheduler.create',
    description: 'Schedule a pipeline.run on a cron expression.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = CreateInput.parse(raw);
      validateCron(args.cron_expr);
      const next = nextRunAt(parseCron(args.cron_expr), new Date());
      if (!next) throw new Error(`scheduler.create: no firing time for "${args.cron_expr}"`);
      const [row] = await deps.db
        .insert(scheduled_pipelines)
        .values({
          tenant_id: ctx.tenant_id,
          name: args.name,
          cron_expr: args.cron_expr,
          args: args.args,
          enabled: args.enabled ? 1 : 0,
          next_run_at: next,
        })
        .returning();
      if (!row) throw new Error('scheduler.create: insert returned no row');
      return { schedule: redact(row) };
    },
  };

  const list: SyscallSpec = {
    name: 'scheduler.list',
    description: 'List scheduled pipelines for the caller tenant.',
    requiredScope: 'tenant.read',
    handler: async (ctx) => {
      const rows = await deps.db
        .select()
        .from(scheduled_pipelines)
        .where(eq(scheduled_pipelines.tenant_id, ctx.tenant_id));
      return { schedules: rows.map(redact) };
    },
  };

  const update: SyscallSpec = {
    name: 'scheduler.update',
    description: 'Update cron, args, or enabled flag of a schedule (admin).',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = UpdateInput.parse(raw);
      const patch: Record<string, unknown> = {};
      if (args.cron_expr !== undefined) {
        validateCron(args.cron_expr);
        patch.cron_expr = args.cron_expr;
        patch.next_run_at = nextRunAt(parseCron(args.cron_expr), new Date());
      }
      if (args.args !== undefined) patch.args = args.args;
      if (args.enabled !== undefined) patch.enabled = args.enabled ? 1 : 0;
      if (Object.keys(patch).length === 0) {
        throw new Error('scheduler.update: nothing to change');
      }
      const [row] = await deps.db
        .update(scheduled_pipelines)
        .set(patch)
        .where(
          and(
            eq(scheduled_pipelines.id, args.id),
            eq(scheduled_pipelines.tenant_id, ctx.tenant_id),
          ),
        )
        .returning();
      if (!row) throw new Error(`scheduler.update: schedule not found: ${args.id}`);
      return { schedule: redact(row) };
    },
  };

  const del: SyscallSpec = {
    name: 'scheduler.delete',
    description: 'Delete a scheduled pipeline.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = IdInput.parse(raw);
      const rows = await deps.db
        .delete(scheduled_pipelines)
        .where(
          and(
            eq(scheduled_pipelines.id, args.id),
            eq(scheduled_pipelines.tenant_id, ctx.tenant_id),
          ),
        )
        .returning({ id: scheduled_pipelines.id });
      if (rows.length === 0) throw new Error(`scheduler.delete: not found: ${args.id}`);
      return { id: rows[0]!.id, deleted: true };
    },
  };

  const runNow: SyscallSpec = {
    name: 'scheduler.run_now',
    description: 'Trigger a schedule immediately by advancing next_run_at to now.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = IdInput.parse(raw);
      const [row] = await deps.db
        .update(scheduled_pipelines)
        .set({ next_run_at: new Date(0) })
        .where(
          and(
            eq(scheduled_pipelines.id, args.id),
            eq(scheduled_pipelines.tenant_id, ctx.tenant_id),
          ),
        )
        .returning();
      if (!row) throw new Error(`scheduler.run_now: not found: ${args.id}`);
      return { schedule: redact(row), nudged: true };
    },
  };

  return [create, list, update, del, runNow];
}
