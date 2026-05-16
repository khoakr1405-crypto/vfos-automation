import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { webhooks } from '@vfos/db';
import type { EventBus } from '../bus/types.js';
import { encryptToken } from '../connectors/envelope.js';
import type { DbHandle } from '../db/client.js';
import type { SyscallSpec } from '../syscall-registry.js';
import type { WebhookDispatcher } from '../webhooks/dispatcher.js';

export interface WebhooksSyscallDeps {
  db: DbHandle;
  bus: EventBus;
  credentialKey: string;
  dispatcher: WebhookDispatcher;
}

const KNOWN_SCHEMAS = [
  'trend.discovered.v1',
  'niche.classified.v1',
  'affiliate.matched.v1',
  'compliance.decision.v1',
  'render.completed.v1',
  'publish.completed.v1',
  'publish.failed.v1',
  'budget.warn.v1',
  'budget.exceeded.v1',
] as const;

const CreateInput = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), 'url must be http(s)'),
  // Either '*' OR a subset of KNOWN_SCHEMAS. Unknown schemas are accepted
  // too so callers can pre-register listeners for upcoming events.
  schemas: z
    .array(z.string().min(1))
    .min(1)
    .max(32)
    .default(['*']),
  enabled: z.boolean().default(true),
});

const IdInput = z.object({ id: z.string().uuid() });

const UpdateInput = z.object({
  id: z.string().uuid(),
  url: z.string().url().optional(),
  schemas: z.array(z.string().min(1)).min(1).max(32).optional(),
  enabled: z.boolean().optional(),
});

const TestInput = z.object({ id: z.string().uuid() });

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

function redact(row: typeof webhooks.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    url: row.url,
    schemas: row.schemas,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    last_called_at: row.last_called_at,
    last_status: row.last_status,
    last_error: row.last_error,
    delivered_count: row.delivered_count,
    failed_count: row.failed_count,
  };
}

export function makeWebhooksSyscalls(deps: WebhooksSyscallDeps): readonly SyscallSpec[] {
  const create: SyscallSpec = {
    name: 'webhooks.create',
    description: 'Register an outbound webhook. Returns the signing secret ONCE.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = CreateInput.parse(raw);
      const secret = generateSecret();
      const secret_enc = encryptToken(secret, deps.credentialKey);
      const [row] = await deps.db
        .insert(webhooks)
        .values({
          tenant_id: ctx.tenant_id,
          url: args.url,
          secret_enc,
          schemas: args.schemas,
          enabled: args.enabled ? 1 : 0,
        })
        .returning();
      if (!row) throw new Error('webhooks.create: insert returned no row');
      await deps.dispatcher.refresh();
      return {
        webhook: redact(row),
        secret,
        known_schemas: KNOWN_SCHEMAS,
      };
    },
  };

  const list: SyscallSpec = {
    name: 'webhooks.list',
    description: 'List webhooks for the caller tenant (secret redacted).',
    requiredScope: 'tenant.read',
    handler: async (ctx) => {
      const rows = await deps.db
        .select()
        .from(webhooks)
        .where(eq(webhooks.tenant_id, ctx.tenant_id));
      return { webhooks: rows.map(redact), known_schemas: KNOWN_SCHEMAS };
    },
  };

  const update: SyscallSpec = {
    name: 'webhooks.update',
    description: 'Update url, schemas, or enabled flag for a webhook.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = UpdateInput.parse(raw);
      const patch: Record<string, unknown> = {};
      if (args.url !== undefined) patch.url = args.url;
      if (args.schemas !== undefined) patch.schemas = args.schemas;
      if (args.enabled !== undefined) patch.enabled = args.enabled ? 1 : 0;
      if (Object.keys(patch).length === 0) {
        throw new Error('webhooks.update: nothing to change');
      }
      const [row] = await deps.db
        .update(webhooks)
        .set(patch)
        .where(and(eq(webhooks.id, args.id), eq(webhooks.tenant_id, ctx.tenant_id)))
        .returning();
      if (!row) throw new Error(`webhook not found: ${args.id}`);
      await deps.dispatcher.refresh();
      return { webhook: redact(row) };
    },
  };

  const del: SyscallSpec = {
    name: 'webhooks.delete',
    description: 'Delete a webhook.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = IdInput.parse(raw);
      const rows = await deps.db
        .delete(webhooks)
        .where(and(eq(webhooks.id, args.id), eq(webhooks.tenant_id, ctx.tenant_id)))
        .returning({ id: webhooks.id });
      if (rows.length === 0) throw new Error(`webhook not found: ${args.id}`);
      await deps.dispatcher.refresh();
      return { id: rows[0]!.id, deleted: true };
    },
  };

  const test: SyscallSpec = {
    name: 'webhooks.test',
    description: 'Emit a synthetic test event delivered only to this webhook.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = TestInput.parse(raw);
      const rows = await deps.db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, args.id), eq(webhooks.tenant_id, ctx.tenant_id)))
        .limit(1);
      if (rows.length === 0) throw new Error(`webhook not found: ${args.id}`);
      // Synthetic publish — the wildcard subscriber inside the dispatcher
      // picks it up like a real event, including HMAC + retry logic.
      const event = await deps.bus.publish({
        schema: 'webhook.test.v1',
        tenant_id: ctx.tenant_id,
        emitter: `webhooks.test:${args.id}`,
        ...(ctx.trace_id ? { trace_id: ctx.trace_id } : {}),
        payload: { webhook_id: args.id, message: 'this is a test event' },
      });
      return { event_id: event.event_id, schema: event.schema };
    },
  };

  return [create, list, update, del, test];
}
