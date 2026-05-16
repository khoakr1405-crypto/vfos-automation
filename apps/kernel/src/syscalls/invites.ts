import { z } from 'zod';
import {
  createInvite,
  listInvites,
  revokeInvite,
} from '../auth/invites.js';
import type { DbHandle } from '../db/client.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface InvitesSyscallDeps {
  db: DbHandle;
}

const CreateInput = z.object({
  email: z.string().email().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  scopes: z.array(z.string()).default([]),
  is_admin: z.boolean().default(false),
  ttl_hours: z.number().int().positive().max(720).default(168),
});

const ListInput = z.object({
  include_consumed: z.boolean().default(false),
});

const RevokeInput = z.object({
  token: z.string().min(1),
});

function redact(row: Awaited<ReturnType<typeof createInvite>>): Record<string, unknown> {
  return {
    token: row.token,
    email: row.email,
    tenant_id: row.tenant_id,
    scopes: row.scopes,
    is_admin: row.is_admin,
    created_by: row.created_by,
    created_at: row.created_at,
    expires_at: row.expires_at,
    consumed_at: row.consumed_at,
    consumed_by: row.consumed_by,
    revoked_at: row.revoked_at,
  };
}

export function makeInvitesSyscalls(deps: InvitesSyscallDeps): readonly SyscallSpec[] {
  const create: SyscallSpec = {
    name: 'auth.invite.create',
    description: 'Mint a single-use signup invite (admin).',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = CreateInput.parse(raw);
      // Resolve creating user from caller token's auth ctx if available
      const createdBy = ctx.caller.startsWith('http:') ? null : null;
      const invite = await createInvite(deps.db, {
        email: args.email ?? null,
        tenant_id: args.tenant_id === undefined ? null : args.tenant_id,
        scopes: args.scopes,
        is_admin: args.is_admin,
        created_by: createdBy,
        ttl_ms: args.ttl_hours * 3600 * 1000,
      });
      return { invite: redact(invite) };
    },
  };

  const list: SyscallSpec = {
    name: 'auth.invite.list',
    description: 'List signup invites (admin). Defaults to active only.',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = ListInput.parse(raw);
      const rows = await listInvites(deps.db, { include_consumed: args.include_consumed });
      return { invites: rows.map(redact) };
    },
  };

  const revoke: SyscallSpec = {
    name: 'auth.invite.revoke',
    description: 'Revoke an unconsumed signup invite (admin).',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = RevokeInput.parse(raw);
      const ok = await revokeInvite(deps.db, args.token);
      if (!ok) throw new Error(`invite not found or already consumed: ${args.token.slice(0, 12)}…`);
      return { token: args.token, revoked: true };
    },
  };

  return [create, list, revoke];
}
