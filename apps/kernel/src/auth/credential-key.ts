import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Logger } from 'pino';

const KEY_FILENAME = 'credential-key.txt';
// 64 hex chars = 32 random bytes — matches the scrypt-derived key length
// used by connectors/envelope.ts.
const MIN_KEY_CHARS = 32;

/**
 * Resolve the per-install credential encryption key.
 *
 * Resolution order:
 *   1. VFOS_CREDENTIAL_KEY env var — wins if set (use for prod / CI).
 *   2. `<dataDir>/credential-key.txt` — survives kernel restarts.
 *   3. Generate a fresh 32-byte hex key, write it 0o600, return it.
 *
 * If the file is present but too short to be a real key (empty / truncated),
 * we treat it as corrupted, log a warning, and regenerate. This is the only
 * destructive path — but only fires when the file is unusable anyway.
 */
export async function ensureCredentialKey(
  dataDir: string,
  logger: Logger,
): Promise<{ key: string; source: 'env' | 'file' | 'generated' }> {
  const envKey = process.env.VFOS_CREDENTIAL_KEY?.trim();
  if (envKey && envKey.length >= MIN_KEY_CHARS) {
    logger.info('credential-key.source: env');
    return { key: envKey, source: 'env' };
  }
  if (envKey && envKey.length < MIN_KEY_CHARS) {
    logger.warn(
      { len: envKey.length, min: MIN_KEY_CHARS },
      'credential-key.env_too_short — falling through to file/generate',
    );
  }

  const keyPath = join(dataDir, KEY_FILENAME);
  if (existsSync(keyPath)) {
    const existing = readFileSync(keyPath, 'utf8').trim();
    if (existing.length >= MIN_KEY_CHARS) {
      logger.info({ path: keyPath }, 'credential-key.source: file');
      return { key: existing, source: 'file' };
    }
    logger.warn(
      { path: keyPath, len: existing.length },
      'credential-key.file_corrupted — regenerating (existing creds become unreadable)',
    );
  }

  await mkdir(dirname(keyPath), { recursive: true });
  const fresh = randomBytes(32).toString('hex');
  await writeFile(keyPath, `${fresh}\n`, { mode: 0o600 });
  logger.info(
    { path: keyPath },
    'credential-key.generated (persisted, cockpit + smoke will reuse it)',
  );
  return { key: fresh, source: 'generated' };
}
