import { randomBytes } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { oauth_states } from '@vfos/db';
import type { PlatformName } from '../connectors/types.js';
import type { DbHandle } from '../db/client.js';

const STATE_TTL_MS = 10 * 60 * 1000;

export interface CreateStateOpts {
  tenant_id: string;
  platform: PlatformName;
  redirect_uri: string;
}

export interface VerifiedState {
  state: string;
  tenant_id: string;
  platform: PlatformName;
  redirect_uri: string;
}

export async function createOAuthState(
  db: DbHandle,
  opts: CreateStateOpts,
): Promise<{ state: string; expires_at: Date }> {
  const state = randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + STATE_TTL_MS);
  await db.insert(oauth_states).values({
    state,
    tenant_id: opts.tenant_id,
    platform: opts.platform,
    redirect_uri: opts.redirect_uri,
    expires_at,
  });
  return { state, expires_at };
}

export async function consumeOAuthState(
  db: DbHandle,
  state: string,
  platform: PlatformName,
): Promise<VerifiedState | null> {
  const now = new Date();
  const rows = await db
    .update(oauth_states)
    .set({ consumed_at: now })
    .where(
      and(
        eq(oauth_states.state, state),
        eq(oauth_states.platform, platform),
        isNull(oauth_states.consumed_at),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() < now.getTime()) return null;
  return {
    state: row.state,
    tenant_id: row.tenant_id,
    platform: row.platform as PlatformName,
    redirect_uri: row.redirect_uri,
  };
}

export async function purgeExpiredStates(db: DbHandle): Promise<number> {
  const rows = await db
    .delete(oauth_states)
    .where(lt(oauth_states.expires_at, new Date()))
    .returning({ state: oauth_states.state });
  return rows.length;
}
