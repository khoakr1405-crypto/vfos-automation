import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import type { DbHandle } from '../db/client.js';
import { createToken, validateToken } from './tokens.js';

const ADMIN_TOKEN_FILENAME = 'admin-token.txt';

/**
 * Ensure at least one admin token exists.
 *
 * - If `data/admin-token.txt` exists and still validates → reuse it.
 * - Otherwise generate a new admin token (scope `*`, tenant_id null) and
 *   write it to disk so the cockpit + CLI can pick it up.
 *
 * The file is mode 0600 to keep the token off other local users.
 */
export async function ensureAdminToken(
  db: DbHandle,
  dataDir: string,
  logger: Logger,
): Promise<void> {
  const tokenPath = join(dataDir, ADMIN_TOKEN_FILENAME);
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, 'utf8').trim();
    const ctx = await validateToken(db, existing);
    if (ctx?.is_admin) {
      logger.info({ path: tokenPath }, 'auth.admin-token.reused');
      return;
    }
    logger.warn(
      { path: tokenPath },
      'auth.admin-token.file-stale (will regenerate)',
    );
  }
  const created = await createToken(db, {
    tenant_id: null,
    name: 'admin-bootstrap',
    scopes: ['*'],
  });
  await writeFile(tokenPath, `${created.raw_token}\n`, { mode: 0o600 });
  logger.info(
    { path: tokenPath, token_id: created.id },
    'auth.admin-token.generated (cockpit will read from this path)',
  );
}
