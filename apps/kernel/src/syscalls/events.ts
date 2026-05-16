import { z } from 'zod';
import type { EventBus } from '../bus/types.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface EventsSyscallDeps {
  bus: EventBus;
}

const ReplayInput = z.object({
  event_id: z.string().min(1),
});

export function makeEventsSyscalls(deps: EventsSyscallDeps): readonly SyscallSpec[] {
  const replay: SyscallSpec = {
    name: 'events.replay',
    description: 'Re-publish an existing bus event tagged meta.replay=true; tenant-scoped.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = ReplayInput.parse(raw);
      // Search the in-memory ring buffer for the source event. We scope
      // strictly to the caller tenant so tenant A can't replay tenant
      // B's events.
      const recent = deps.bus.getRecentEvents(500);
      const source = recent.find(
        (e) => e.event_id === args.event_id && e.tenant_id === ctx.tenant_id,
      );
      if (!source) {
        throw new Error(`event not found in recent buffer: ${args.event_id}`);
      }
      const meta: Record<string, unknown> = {
        ...(source.meta ?? {}),
        replay: true,
        original_event_id: source.event_id,
        original_emitted_at: source.emitted_at,
        replayed_by: ctx.caller,
      };
      const replayed = await deps.bus.publish({
        schema: source.schema,
        tenant_id: source.tenant_id,
        emitter: `replay:${source.emitter}`,
        payload: source.payload,
        meta,
        ...(ctx.trace_id ? { trace_id: ctx.trace_id } : {}),
      });
      return {
        event_id: replayed.event_id,
        schema: replayed.schema,
        original_event_id: source.event_id,
      };
    },
  };

  return [replay];
}
