import { count, eq } from 'drizzle-orm';
import { users } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import { hashPassword, verifyPassword } from './passwords.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserRow {
  id: string;
  email: string;
  tenant_id: string | null;
  is_admin: boolean;
  created_at: Date;
  last_login_at: Date | null;
  disabled_at: Date | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rowToUser(row: typeof users.$inferSelect): UserRow {
  return {
    id: row.id,
    email: row.email,
    tenant_id: row.tenant_id,
    is_admin: row.is_admin === 1,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
    disabled_at: row.disabled_at,
  };
}

export async function userCount(db: DbHandle): Promise<number> {
  const rows = await db.select({ n: count() }).from(users);
  return rows[0]?.n ?? 0;
}

export async function findUserByEmail(db: DbHandle, email: string): Promise<UserRow | null> {
  const e = normalizeEmail(email);
  const rows = await db.select().from(users).where(eq(users.email, e)).limit(1);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  tenant_id: string | null;
  is_admin: boolean;
}

export async function createUser(db: DbHandle, input: CreateUserInput): Promise<UserRow> {
  const e = normalizeEmail(input.email);
  if (!EMAIL_RE.test(e)) throw new Error('invalid email');
  const hash = hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      email: e,
      password_hash: hash,
      tenant_id: input.tenant_id,
      is_admin: input.is_admin ? 1 : 0,
    })
    .returning();
  if (!row) throw new Error('user.create: insert returned no row');
  return rowToUser(row);
}

export async function verifyUserCredentials(
  db: DbHandle,
  email: string,
  password: string,
): Promise<UserRow | null> {
  const e = normalizeEmail(email);
  const rows = await db.select().from(users).where(eq(users.email, e)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.disabled_at !== null) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  void db
    .update(users)
    .set({ last_login_at: new Date() })
    .where(eq(users.id, row.id))
    .catch(() => undefined);
  return rowToUser(row);
}
