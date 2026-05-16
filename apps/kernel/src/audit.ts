import type { Logger } from 'pino';
import { audit_log } from '@vfos/db';
import type { DbHandle } from './db/client.js';

// Field name fragments whose values must never land in audit_log.payload.
// Match is case-insensitive substring — so 'api_key', 'access_token',
// 'refresh_token', 'password_hash', 'secret_enc' are all caught.
const REDACT_FRAGMENTS = [
  'password',
  'secret',
  'api_key',
  'token',
  '_key',
  'private',
];

export function redactArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (REDACT_FRAGMENTS.some((frag) => lower.includes(frag))) {
      // Preserve type-of so reviewers know a value WAS present.
      out[k] = typeof v === 'string' ? `[redacted:${v.length}c]` : '[redacted]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactArgs(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Best-effort extraction of a target identifier from the args object.
 * Looks for the common identifier-shaped fields. Returns null if none
 * match — the audit row will just omit `target`.
 */
export function extractTarget(args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const o = args as Record<string, unknown>;
  for (const key of ['id', 'name', 'token', 'provider', 'tenant_id', 'platform', 'event_id']) {
    const v = o[key];
    if (typeof v === 'string' && v.length > 0) return `${key}=${v}`;
  }
  return null;
}

export interface AuditEntry {
  tenant_id: string | null;
  actor: string;
  action: string;
  target: string | null;
  payload: Record<string, unknown>;
  status: 'ok' | 'error';
  error: string | null;
  trace_id: string | null;
  duration_ms: number;
}

export class AuditLogger {
  constructor(
    private readonly db: DbHandle,
    private readonly logger: Logger,
  ) {}

  /**
   * Insert an audit row. Fire-and-forget at the caller — but we still
   * await internally so we can swallow DB errors cleanly (audit failure
   * MUST NOT propagate into the syscall path).
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(audit_log).values({
        tenant_id: entry.tenant_id,
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        payload: entry.payload,
        status: entry.status,
        error: entry.error,
        trace_id: entry.trace_id,
        duration_ms: entry.duration_ms,
      });
    } catch (err) {
      this.logger.error({ err, action: entry.action }, 'audit.write_failed');
    }
  }
}
