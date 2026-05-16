import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { api_tokens } from '@vfos/db';
import type { DbHandle } from '../db/client.js';

const TOKEN_PREFIX = 'vfos_';
const TOKEN_BYTES = 32;

export interface AuthContext {
  token_id: string;
  tenant_id: string | null;
  scopes: readonly string[];
  is_admin: boolean;
}

export interface TokenRow {
  id: string;
  tenant_id: string | null;
  name: string;
  scopes: readonly string[];
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

export function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function validateToken(
  db: DbHandle,
  raw: string,
): Promise<AuthContext | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const h = hashToken(raw);
  const rows = await db.select().from(api_tokens).where(eq(api_tokens.hash, h)).limit(1);
  const t = rows[0];
  if (!t) return null;
  // Constant-time compare guards against timing oracle on hash columns.
  if (!constantTimeEqual(t.hash, h)) return null;
  if (t.revoked_at) return null;
  // Best-effort last_used_at update; never blocks the validation path.
  void db
    .update(api_tokens)
    .set({ last_used_at: new Date() })
    .where(eq(api_tokens.id, t.id))
    .catch(() => undefined);
  const scopes = (t.scopes ?? []) as readonly string[];
  return {
    token_id: t.id,
    tenant_id: t.tenant_id,
    scopes,
    is_admin: scopes.includes('*'),
  };
}

export interface CreateTokenInput {
  tenant_id: string | null;
  name: string;
  scopes: readonly string[];
}

export interface CreateTokenResult {
  id: string;
  raw_token: string;
  tenant_id: string | null;
  name: string;
  scopes: readonly string[];
}

export async function createToken(
  db: DbHandle,
  input: CreateTokenInput,
): Promise<CreateTokenResult> {
  const raw = generateRawToken();
  const hash = hashToken(raw);
  const [row] = await db
    .insert(api_tokens)
    .values({
      tenant_id: input.tenant_id,
      name: input.name,
      hash,
      scopes: [...input.scopes],
    })
    .returning();
  if (!row) throw new Error('token.create: insert returned no row');
  return {
    id: row.id,
    raw_token: raw,
    tenant_id: row.tenant_id,
    name: row.name,
    scopes: (row.scopes ?? []) as readonly string[],
  };
}

export async function listTokens(
  db: DbHandle,
  filter: { tenant_id?: string | null; include_revoked?: boolean } = {},
): Promise<readonly TokenRow[]> {
  const conditions = [] as ReturnType<typeof eq>[];
  if (filter.tenant_id === null) {
    conditions.push(isNull(api_tokens.tenant_id) as ReturnType<typeof eq>);
  } else if (typeof filter.tenant_id === 'string') {
    conditions.push(eq(api_tokens.tenant_id, filter.tenant_id));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      id: api_tokens.id,
      tenant_id: api_tokens.tenant_id,
      name: api_tokens.name,
      scopes: api_tokens.scopes,
      created_at: api_tokens.created_at,
      last_used_at: api_tokens.last_used_at,
      revoked_at: api_tokens.revoked_at,
    })
    .from(api_tokens)
    .where(where ?? undefined)
    .orderBy(desc(api_tokens.created_at));
  const visible = filter.include_revoked
    ? rows
    : rows.filter((r) => r.revoked_at === null);
  return visible.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    name: r.name,
    scopes: (r.scopes ?? []) as readonly string[],
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    revoked_at: r.revoked_at,
  }));
}

export async function revokeToken(db: DbHandle, id: string): Promise<boolean> {
  const result = await db
    .update(api_tokens)
    .set({ revoked_at: new Date() })
    .where(eq(api_tokens.id, id))
    .returning({ id: api_tokens.id });
  return result.length > 0;
}
