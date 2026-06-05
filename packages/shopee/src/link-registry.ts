/**
 * Shopee Link Registry v0 (Round 26B) — global dedupe registry for Shopee
 * Affiliate links extracted via CDP targeted-click flow.
 *
 * Path: production/_commerce/shopee_link_registry.json
 *
 * Concurrency safety (HARD):
 *   1. Acquire exclusive lock file (`.lock`) with bounded retry.
 *   2. Read latest registry from disk AFTER lock — never write stale snapshot.
 *   3. Merge new entries with dedup (shopid+itemid > canonical > short_link > name).
 *   4. Atomic write: write to `.tmp.<pid>.<ts>` then rename to final path.
 *   5. Release lock in finally{} — never leak.
 *
 * Reason codes (return as throw class `LinkRegistryError`):
 *   - ERR_LINK_REGISTRY_LOCK_TIMEOUT  — could not acquire lock within timeout
 *   - ERR_LINK_REGISTRY_STALE_LOCK    — lock file older than staleness threshold
 *   - ERR_LINK_REGISTRY_WRITE_FAILED  — atomic rename failed
 *
 * Security: registry contains ZERO cookie/token/PII. Only public product data
 * + affiliate URL + owner id (which is the operator's own affiliate id).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { dirname } from "node:path";

export type LinkRegistryReasonCode =
  | "ERR_LINK_REGISTRY_LOCK_TIMEOUT"
  | "ERR_LINK_REGISTRY_STALE_LOCK"
  | "ERR_LINK_REGISTRY_WRITE_FAILED";

export class LinkRegistryError extends Error {
  reason_code: LinkRegistryReasonCode;
  constructor(reason_code: LinkRegistryReasonCode, message: string) {
    super(message);
    this.reason_code = reason_code;
    this.name = "LinkRegistryError";
  }
}

export interface LinkRegistryEntry {
  product_name: string;
  shopid: string | null;
  itemid: string | null;
  short_link: string | null;
  canonical_url: string | null;
  affiliate_owner_id: string | null;
  affiliate_link_status: string;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
  times_seen: number;
  notes: string;
  /** Safe public CDN image URL captured at extraction. Optional — entries
   *  written before this field existed simply omit it (backward compatible). */
  product_image_url?: string | null;
}

export interface LinkRegistryRejected {
  short_link: string | null;
  canonical_url: string | null;
  reason_code: string;
  seen_at: string;
  notes: string;
}

export interface LinkRegistry {
  schema_version: "0.1.0";
  updated_at: string;
  expected_affiliate_owner_id: string;
  entries: LinkRegistryEntry[];
  rejected: LinkRegistryRejected[];
}

export interface LinkRegistryConfig {
  /** Absolute path to registry JSON */
  registry_path: string;
  /** Expected affiliate owner id (eg "an_17376660568") */
  expected_owner_id: string;
  /** Lock acquire timeout in ms (default 5000) */
  lock_timeout_ms?: number;
  /** Lock retry interval in ms (default 100) */
  lock_retry_ms?: number;
  /** A lock file older than this is considered stale (default 60000) */
  stale_lock_ms?: number;
}

const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const DEFAULT_LOCK_RETRY_MS = 100;
const DEFAULT_STALE_LOCK_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function emptyRegistry(owner_id: string): LinkRegistry {
  return {
    schema_version: "0.1.0",
    updated_at: new Date().toISOString(),
    expected_affiliate_owner_id: owner_id,
    entries: [],
    rejected: [],
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCanonical(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Dedup key resolution priority (HARD):
 *   1. shopid + itemid
 *   2. canonical_url normalized (host + path, drop query)
 *   3. short_link
 *   4. normalized product_name
 */
export function findExistingEntry(
  registry: LinkRegistry,
  probe: Partial<LinkRegistryEntry>,
): LinkRegistryEntry | null {
  if (probe.shopid && probe.itemid) {
    const hit = registry.entries.find(
      (e) => e.shopid === probe.shopid && e.itemid === probe.itemid,
    );
    if (hit) return hit;
  }
  const probeCanonical = normalizeCanonical(probe.canonical_url ?? null);
  if (probeCanonical) {
    const hit = registry.entries.find((e) => normalizeCanonical(e.canonical_url) === probeCanonical);
    if (hit) return hit;
  }
  if (probe.short_link) {
    const hit = registry.entries.find((e) => e.short_link === probe.short_link);
    if (hit) return hit;
  }
  if (probe.product_name) {
    const probeName = normalizeName(probe.product_name);
    const hit = registry.entries.find((e) => normalizeName(e.product_name) === probeName);
    if (hit) return hit;
  }
  return null;
}

/**
 * Acquire exclusive lock by creating .lock file with `wx` flag (atomic on POSIX
 * and Windows NTFS). Polls every `lock_retry_ms` until timeout.
 *
 * Throws ERR_LINK_REGISTRY_STALE_LOCK if an existing lock is older than
 * stale_lock_ms — caller must manually inspect & remove (we never auto-remove
 * because the holder process may still be alive).
 */
async function acquireLock(
  lock_path: string,
  timeout_ms: number,
  retry_ms: number,
  stale_ms: number,
): Promise<void> {
  const deadline = Date.now() + timeout_ms;
  let staleReported = false;

  while (Date.now() < deadline) {
    try {
      writeFileSync(lock_path, `${process.pid}\n${new Date().toISOString()}\n`, { flag: "wx" });
      return;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "EEXIST") throw e;

      if (!staleReported && existsSync(lock_path)) {
        try {
          const st = statSync(lock_path);
          if (Date.now() - st.mtimeMs > stale_ms) {
            throw new LinkRegistryError(
              "ERR_LINK_REGISTRY_STALE_LOCK",
              `Lock file ${lock_path} is older than ${stale_ms}ms (pid may have crashed). Manual inspection required — remove only if no process owns it.`,
            );
          }
        } catch (statErr) {
          if (statErr instanceof LinkRegistryError) throw statErr;
        }
        staleReported = true;
      }

      await sleep(retry_ms);
    }
  }

  throw new LinkRegistryError(
    "ERR_LINK_REGISTRY_LOCK_TIMEOUT",
    `Could not acquire lock ${lock_path} within ${timeout_ms}ms`,
  );
}

function releaseLock(lock_path: string): void {
  try {
    if (existsSync(lock_path)) unlinkSync(lock_path);
  } catch {
    // Best effort — never throw from release
  }
}

function readRegistry(registry_path: string, owner_id: string): LinkRegistry {
  if (!existsSync(registry_path)) return emptyRegistry(owner_id);
  const raw = readFileSync(registry_path, "utf-8");
  const parsed = JSON.parse(raw) as LinkRegistry;
  if (parsed.schema_version !== "0.1.0") {
    throw new LinkRegistryError(
      "ERR_LINK_REGISTRY_WRITE_FAILED",
      `Registry schema_version=${parsed.schema_version} not supported (expected 0.1.0)`,
    );
  }
  return parsed;
}

function atomicWrite(registry_path: string, data: LinkRegistry): void {
  const dir = dirname(registry_path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${registry_path}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(data, null, 2);
  try {
    JSON.parse(json); // sanity — never write corrupt JSON
  } catch (err) {
    throw new LinkRegistryError(
      "ERR_LINK_REGISTRY_WRITE_FAILED",
      `Refusing to write — JSON sanity check failed: ${(err as Error).message}`,
    );
  }
  writeFileSync(tmp, json, "utf-8");
  try {
    renameSync(tmp, registry_path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw new LinkRegistryError(
      "ERR_LINK_REGISTRY_WRITE_FAILED",
      `Atomic rename failed: ${(err as Error).message}`,
    );
  }
}

export interface UpsertResult {
  /** Was this a new entry (true) or existing (false)? */
  inserted: boolean;
  /** Was this entry skipped because it is a duplicate? */
  duplicate: boolean;
  /** The resolved entry after merge */
  entry: LinkRegistryEntry;
}

/**
 * Upsert one entry into the registry under lock + atomic write.
 *
 * If an existing entry matches by dedup key, increment times_seen + update
 * last_seen_at (merge mode). If new, append.
 */
export async function upsertEntry(
  config: LinkRegistryConfig,
  candidate: Omit<LinkRegistryEntry, "first_seen_at" | "last_seen_at" | "times_seen">,
): Promise<UpsertResult> {
  const lock_path = `${config.registry_path}.lock`;
  const now = new Date().toISOString();
  await acquireLock(
    lock_path,
    config.lock_timeout_ms ?? DEFAULT_LOCK_TIMEOUT_MS,
    config.lock_retry_ms ?? DEFAULT_LOCK_RETRY_MS,
    config.stale_lock_ms ?? DEFAULT_STALE_LOCK_MS,
  );
  try {
    const registry = readRegistry(config.registry_path, config.expected_owner_id);
    const existing = findExistingEntry(registry, candidate);

    if (existing) {
      existing.last_seen_at = now;
      existing.times_seen += 1;
      registry.updated_at = now;
      atomicWrite(config.registry_path, registry);
      return { inserted: false, duplicate: true, entry: existing };
    }

    const newEntry: LinkRegistryEntry = {
      ...candidate,
      first_seen_at: now,
      last_seen_at: now,
      times_seen: 1,
    };
    registry.entries.push(newEntry);
    registry.updated_at = now;
    atomicWrite(config.registry_path, registry);
    return { inserted: true, duplicate: false, entry: newEntry };
  } finally {
    releaseLock(lock_path);
  }
}

/**
 * Append a rejected entry (link extraction failed / owner mismatch / validation
 * failed). Same concurrency rules as upsertEntry.
 */
export async function appendRejected(
  config: LinkRegistryConfig,
  rejected: Omit<LinkRegistryRejected, "seen_at">,
): Promise<void> {
  const lock_path = `${config.registry_path}.lock`;
  await acquireLock(
    lock_path,
    config.lock_timeout_ms ?? DEFAULT_LOCK_TIMEOUT_MS,
    config.lock_retry_ms ?? DEFAULT_LOCK_RETRY_MS,
    config.stale_lock_ms ?? DEFAULT_STALE_LOCK_MS,
  );
  try {
    const registry = readRegistry(config.registry_path, config.expected_owner_id);
    registry.rejected.push({ ...rejected, seen_at: new Date().toISOString() });
    registry.updated_at = new Date().toISOString();
    atomicWrite(config.registry_path, registry);
  } finally {
    releaseLock(lock_path);
  }
}

/**
 * Read-only check: does an entry matching the probe already exist?
 * No lock needed — readers may see in-flight writes (acceptable for a "should
 * I skip this click?" pre-check).
 */
export function isDuplicate(
  registry_path: string,
  expected_owner_id: string,
  probe: Partial<LinkRegistryEntry>,
): boolean {
  if (!existsSync(registry_path)) return false;
  try {
    const registry = readRegistry(registry_path, expected_owner_id);
    return findExistingEntry(registry, probe) !== null;
  } catch {
    return false;
  }
}
