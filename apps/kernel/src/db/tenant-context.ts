import { sql } from 'drizzle-orm';
import type { DbHandle } from './client.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a transaction with `app.tenant_id` set as a session-local GUC.
 * RLS policies on tenant-scoped tables (e.g. assets) match against this value,
 * so DML inside `fn` is automatically isolated to the given tenant.
 */
export async function withTenant<T>(
  db: DbHandle,
  tenant_id: string,
  fn: (tx: DbHandle) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenant_id)) {
    throw new Error(`withTenant: tenant_id is not a valid UUID: ${tenant_id}`);
  }
  return db.transaction(async (tx) => {
    // Parameter substitution can't be used with SET LOCAL (parsed as utility),
    // so we validate the UUID format above and inline-quote it.
    // Switch to the non-superuser app role so RLS policies actually apply;
    // both settings are LOCAL to the transaction so they auto-reset on commit.
    await tx.execute(sql.raw(`SET LOCAL ROLE vfos_app`));
    await tx.execute(sql.raw(`SET LOCAL app.tenant_id = '${tenant_id}'`));
    return fn(tx as unknown as DbHandle);
  });
}
