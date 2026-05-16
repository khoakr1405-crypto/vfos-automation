import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt parameters: N=2^15 (cost), r=8, p=1, dkLen=64.
// Tuned to ~150ms on a modern laptop — fast enough for interactive login,
// slow enough to make offline cracking expensive.
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

const ENVELOPE_PREFIX = 'scrypt:v1';

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
}

export function hashPassword(password: string): string {
  if (!password || password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }
  const salt = randomBytes(SALT_LEN);
  const key = deriveKey(password, salt);
  return `${ENVELOPE_PREFIX}:${salt.toString('base64')}:${key.toString('base64')}`;
}

export function verifyPassword(password: string, envelope: string): boolean {
  if (!password || !envelope) return false;
  const parts = envelope.split(':');
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    return false;
  }
  const salt = Buffer.from(parts[2]!, 'base64');
  const expected = Buffer.from(parts[3]!, 'base64');
  const actual = deriveKey(password, salt);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
