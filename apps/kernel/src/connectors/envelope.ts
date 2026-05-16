import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const SALT = 'vfos-credential-salt-v1';

let cachedKey: Buffer | null = null;
let cachedSecret: string | null = null;

function deriveKey(secret: string): Buffer {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = scryptSync(secret, SALT, 32);
  cachedSecret = secret;
  return cachedKey;
}

export function encryptToken(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptToken(envelope: string, secret: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('credential envelope: unsupported format');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64!, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
