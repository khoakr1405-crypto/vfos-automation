import { z } from 'zod';
import { createToken, listTokens, revokeToken } from '../auth/tokens.js';
import type { DbHandle } from '../db/client.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface TokensSyscallDeps {
  db: DbHandle;
}

const CreateInput = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(80),
  scopes: z.array(z.string().min(1)).default([]),
});

const ListInput = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  include_revoked: z.boolean().default(false),
});

const RevokeInput = z.object({
  id: z.string().uuid(),
});

export function makeTokensSyscalls(deps: TokensSyscallDeps): readonly SyscallSpec[] {
  const create: SyscallSpec = {
    name: 'tokens.create',
    description: 'Mint a new API token (admin). Raw token returned ONCE.',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = CreateInput.parse(raw);
      const created = await createToken(deps.db, {
        tenant_id: args.tenant_id ?? null,
        name: args.name,
        scopes: args.scopes,
      });
      return created;
    },
  };

  const list: SyscallSpec = {
    name: 'tokens.list',
    description: 'List tokens, optionally filtered by tenant_id (admin).',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = ListInput.parse(raw);
      const filter: { tenant_id?: string | null; include_revoked?: boolean } = {
        include_revoked: args.include_revoked,
      };
      if (args.tenant_id !== undefined) filter.tenant_id = args.tenant_id;
      const tokens = await listTokens(deps.db, filter);
      return { tokens };
    },
  };

  const revoke: SyscallSpec = {
    name: 'tokens.revoke',
    description: 'Revoke an API token by id (admin).',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = RevokeInput.parse(raw);
      const ok = await revokeToken(deps.db, args.id);
      if (!ok) throw new Error(`token not found: ${args.id}`);
      return { id: args.id, revoked: true };
    },
  };

  return [create, list, revoke];
}
