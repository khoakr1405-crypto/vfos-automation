import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { user_invites } from '@vfos/db';
import type { DbHandle } from '../db/client.js';

const TOKEN_PREFIX = 'inv_';
const TOKEN_BYTES = 24;
const DEFAULT_TTL_MS = 7 * 24 * 3600 * 1000;

export interface CreateInviteInput {
  email?: string | null;
  tenant_id: string | null;
  scopes: readonly string[];
  is_admin: boolean;
  created_by: string | null;
  ttl_ms?: number;
}

export interface InviteRow {
  token: string;
  email: string | null;
  tenant_id: string | null;
  scopes: readonly string[];
  is_admin: boolean;
  created_by: string | null;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
  consumed_by: string | null;
  revoked_at: Date | null;
}

function toRow(r: typeof user_invites.$inferSelect): InviteRow {
  return {
    token: r.token,
    email: r.email,
    tenant_id: r.tenant_id,
    scopes: (r.scopes ?? []) as readonly string[],
    is_admin: r.is_admin === 1,
    created_by: r.created_by,
    created_at: r.created_at,
    expires_at: r.expires_at,
    consumed_at: r.consumed_at,
    consumed_by: r.consumed_by,
    revoked_at: r.revoked_at,
  };
}

export async function createInvite(db: DbHandle, input: CreateInviteInput): Promise<InviteRow> {
  const token = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
  const expires_at = new Date(Date.now() + (input.ttl_ms ?? DEFAULT_TTL_MS));
  const [row] = await db
    .insert(user_invites)
    .values({
      token,
      email: input.email ?? null,
      tenant_id: input.tenant_id,
      scopes: [...input.scopes],
      is_admin: input.is_admin ? 1 : 0,
      created_by: input.created_by,
      expires_at,
    })
    .returning();
  if (!row) throw new Error('invite.create: insert returned no row');
  return toRow(row);
}

export async function listInvites(
  db: DbHandle,
  opts: { include_consumed?: boolean } = {},
): Promise<readonly InviteRow[]> {
  const rows = await db
    .select()
    .from(user_invites)
    .orderBy(desc(user_invites.created_at));
  const filtered = opts.include_consumed
    ? rows
    : rows.filter((r) => r.consumed_at === null && r.revoked_at === null);
  return filtered.map(toRow);
}

export async function getInviteByToken(db: DbHandle, token: string): Promise<InviteRow | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const rows = await db
    .select()
    .from(user_invites)
    .where(eq(user_invites.token, token))
    .limit(1);
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Atomically mark an invite consumed. Returns the row only if it was still
 * unconsumed, unrevoked, and unexpired at the time of the update.
 */
export async function consumeInvite(
  db: DbHandle,
  token: string,
  consumedBy: string,
): Promise<InviteRow | null> {
  const now = new Date();
  const rows = await db
    .update(user_invites)
    .set({ consumed_at: now, consumed_by: consumedBy })
    .where(
      and(
        eq(user_invites.token, token),
        isNull(user_invites.consumed_at),
        isNull(user_invites.revoked_at),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() < now.getTime()) {
    // Rollback the consumption flag since this was an expired invite.
    await db
      .update(user_invites)
      .set({ consumed_at: null, consumed_by: null })
      .where(eq(user_invites.token, token));
    return null;
  }
  return toRow(row);
}

export async function revokeInvite(db: DbHandle, token: string): Promise<boolean> {
  const rows = await db
    .update(user_invites)
    .set({ revoked_at: new Date() })
    .where(and(eq(user_invites.token, token), isNull(user_invites.consumed_at)))
    .returning({ token: user_invites.token });
  return rows.length > 0;
}
