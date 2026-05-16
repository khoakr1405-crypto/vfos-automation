import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenant_keys } from '@vfos/db';
import type { TenantDriverFactory } from '../ai/tenant-driver-factory.js';
import { encryptToken } from '../connectors/envelope.js';
import type { DbHandle } from '../db/client.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface KeysSyscallDeps {
  db: DbHandle;
  credentialKey: string;
  tenantDriverFactory: TenantDriverFactory;
}

// Restrict to providers the kernel knows how to inject keys into. Adding
// a new provider here requires extending TenantDriverFactory.resolve().
const SUPPORTED_PROVIDERS = ['anthropic'] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

const SetInput = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  api_key: z.string().min(8),
  label: z.string().max(80).optional(),
});

const RevokeInput = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
});

interface KeyRow {
  provider: SupportedProvider;
  label: string | null;
  last4: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  active: boolean;
}

function redact(row: typeof tenant_keys.$inferSelect): KeyRow {
  return {
    provider: row.provider as SupportedProvider,
    label: row.label,
    last4: row.last4,
    fingerprint: row.fingerprint,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_used_at: row.last_used_at ? row.last_used_at.toISOString() : null,
    revoked_at: row.revoked_at ? row.revoked_at.toISOString() : null,
    active: row.revoked_at === null,
  };
}

export function makeKeysSyscalls(deps: KeysSyscallDeps): readonly SyscallSpec[] {
  const set: SyscallSpec = {
    name: 'keys.set',
    description: 'Upsert the caller-tenant API key for an LLM provider (encrypted at rest).',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = SetInput.parse(raw);
      const trimmed = args.api_key.trim();
      // Fingerprint is sha256 truncated — used to compare keys without
      // ever exposing the plaintext, and last4 is the display affordance.
      const fingerprint = createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
      const last4 = trimmed.slice(-4);
      const enc = encryptToken(trimmed, deps.credentialKey);
      const [row] = await deps.db
        .insert(tenant_keys)
        .values({
          tenant_id: ctx.tenant_id,
          provider: args.provider,
          api_key_enc: enc,
          label: args.label ?? null,
          fingerprint,
          last4,
          revoked_at: null,
        })
        .onConflictDoUpdate({
          target: [tenant_keys.tenant_id, tenant_keys.provider],
          set: {
            api_key_enc: enc,
            label: args.label ?? null,
            fingerprint,
            last4,
            updated_at: new Date(),
            revoked_at: null,
          },
        })
        .returning();
      if (!row) throw new Error('keys.set: insert returned no row');
      // Drop any cached driver instance so the next resolve() picks up
      // the new ciphertext + key.
      deps.tenantDriverFactory.invalidate(ctx.tenant_id, args.provider);
      return { key: redact(row) };
    },
  };

  const list: SyscallSpec = {
    name: 'keys.list',
    description: 'List the caller-tenant LLM provider keys (redacted to fingerprint + last4).',
    requiredScope: 'tenant.read',
    handler: async (ctx) => {
      const rows = await deps.db
        .select()
        .from(tenant_keys)
        .where(eq(tenant_keys.tenant_id, ctx.tenant_id));
      return {
        keys: rows.map(redact),
        supported_providers: SUPPORTED_PROVIDERS,
      };
    },
  };

  const revoke: SyscallSpec = {
    name: 'keys.revoke',
    description: 'Revoke the caller-tenant key for a provider; the next LLM call uses the global key.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = RevokeInput.parse(raw);
      const [row] = await deps.db
        .update(tenant_keys)
        .set({ revoked_at: new Date(), updated_at: new Date() })
        .where(
          and(
            eq(tenant_keys.tenant_id, ctx.tenant_id),
            eq(tenant_keys.provider, args.provider),
          ),
        )
        .returning();
      if (!row) throw new Error(`keys.revoke: no key for ${args.provider}`);
      deps.tenantDriverFactory.invalidate(ctx.tenant_id, args.provider);
      return { key: redact(row), revoked: true };
    },
  };

  return [set, list, revoke];
}
