import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenant_quotas, tenants } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import type { RateLimiter } from '../rate-limit.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface TenantSyscallDeps {
  db: DbHandle;
  rateLimiter?: RateLimiter;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const TIERS = ['solo', 'pro', 'agency'] as const;

const CreateInput = z.object({
  slug: z.string().regex(SLUG_RE, 'slug must be 3-64 chars [a-z0-9-]'),
  tier: z.enum(TIERS).default('solo'),
});

const GetInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().optional(),
});

const QuotaSetInput = z.object({
  tenant_id: z.string().uuid(),
  videos_per_day: z.number().int().positive().optional(),
  budget_usd_per_day: z.number().positive().optional(),
  accounts_max: z.number().int().positive().optional(),
  plugins_max: z.number().int().positive().optional(),
  syscalls_per_minute: z.number().int().positive().max(10_000).optional(),
});

export function makeTenantSyscalls(deps: TenantSyscallDeps): readonly SyscallSpec[] {
  const list: SyscallSpec = {
    name: 'tenant.list',
    description: 'List all tenants with their quotas (admin).',
    requiredScope: 'tenant.admin',
    handler: async () => {
      const rows = await deps.db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          tier: tenants.tier,
          created_at: tenants.created_at,
          videos_per_day: tenant_quotas.videos_per_day,
          budget_usd_per_day: tenant_quotas.budget_usd_per_day,
          accounts_max: tenant_quotas.accounts_max,
          plugins_max: tenant_quotas.plugins_max,
          syscalls_per_minute: tenant_quotas.syscalls_per_minute,
        })
        .from(tenants)
        .leftJoin(tenant_quotas, eq(tenant_quotas.tenant_id, tenants.id));
      return { tenants: rows };
    },
  };

  const create: SyscallSpec = {
    name: 'tenant.create',
    description: 'Create a new tenant with default quota (admin).',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = CreateInput.parse(raw);
      const [created] = await deps.db
        .insert(tenants)
        .values({ slug: args.slug, tier: args.tier })
        .returning();
      if (!created) throw new Error('tenant.create returned no row');
      await deps.db.insert(tenant_quotas).values({ tenant_id: created.id });
      return created;
    },
  };

  const get: SyscallSpec = {
    name: 'tenant.get',
    description: 'Look up a tenant by id or slug.',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = GetInput.parse(raw);
      if (!args.id && !args.slug) throw new Error('id or slug required');
      const row = args.id
        ? await deps.db.select().from(tenants).where(eq(tenants.id, args.id)).limit(1)
        : await deps.db.select().from(tenants).where(eq(tenants.slug, args.slug!)).limit(1);
      const tenant = row[0];
      if (!tenant) throw new Error('tenant not found');
      const q = await deps.db
        .select()
        .from(tenant_quotas)
        .where(eq(tenant_quotas.tenant_id, tenant.id))
        .limit(1);
      return { tenant, quota: q[0] ?? null };
    },
  };

  const quotaSet: SyscallSpec = {
    name: 'tenant.quota.set',
    description: 'Update tenant quota fields (admin).',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = QuotaSetInput.parse(raw);
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (args.videos_per_day !== undefined) patch.videos_per_day = args.videos_per_day;
      if (args.budget_usd_per_day !== undefined)
        patch.budget_usd_per_day = args.budget_usd_per_day.toFixed(2);
      if (args.accounts_max !== undefined) patch.accounts_max = args.accounts_max;
      if (args.plugins_max !== undefined) patch.plugins_max = args.plugins_max;
      if (args.syscalls_per_minute !== undefined)
        patch.syscalls_per_minute = args.syscalls_per_minute;
      const [updated] = await deps.db
        .update(tenant_quotas)
        .set(patch)
        .where(eq(tenant_quotas.tenant_id, args.tenant_id))
        .returning();
      if (!updated) throw new Error('tenant quota not found');
      // Invalidate the rate-limiter capacity cache for this tenant so the
      // change applies on the next syscall instead of after TTL.
      if (deps.rateLimiter && args.syscalls_per_minute !== undefined) {
        deps.rateLimiter.setCapacity(args.tenant_id, args.syscalls_per_minute);
      }
      return updated;
    },
  };

  return [list, create, get, quotaSet];
}
