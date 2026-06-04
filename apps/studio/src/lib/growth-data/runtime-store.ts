/* =============================================================================
 * VFOS Studio — Manual performance runtime store (Round Real Analytics 02B)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. node:fs — chỉ import từ route handler, KHÔNG vào client.
 * Ghi snapshot Operator đã preview vào file LOCAL RUNTIME (gitignored):
 *   data/growth/runtime/manual-performance-snapshots.json
 * Never-throw đọc; dedupe theo snapshotId; ghi atomic (tmp → rename).
 * KHÔNG gọi API, KHÔNG ghi vào fixtures source, KHÔNG log payload thô.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveInsideRepo } from './paths';
import type { ManualPerformanceSnapshot } from './types';

const RUNTIME_REL = join('data', 'growth', 'runtime', 'manual-performance-snapshots.json');
const SCHEMA_VERSION = 1;

/** Snapshot lưu runtime = ManualPerformanceSnapshot + thời điểm lưu. */
export interface StoredSnapshot extends ManualPerformanceSnapshot {
  savedAt: string;
}

export interface RuntimeStoreFile {
  schemaVersion: number;
  updatedAt: string;
  snapshots: StoredSnapshot[];
}

export interface AppendResult {
  ok: boolean;
  savedCount: number;
  duplicateIds: string[];
  totalAfter: number;
}

/** Absolute path runtime file (anti-traversal). null nếu không resolve được. */
function runtimePath(): string | null {
  return resolveInsideRepo(RUNTIME_REL);
}

/** true nếu định vị được path runtime (không lộ path thật ra ngoài). */
export function runtimePathConfigured(): boolean {
  return runtimePath() !== null;
}

function emptyStore(): RuntimeStoreFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), snapshots: [] };
}

/** Đọc store hiện tại. Never-throw → trả empty nếu thiếu/hỏng/sai shape. */
export function readRuntimeStore(): RuntimeStoreFile {
  const p = runtimePath();
  if (!p || !existsSync(p)) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    const obj = parsed as Partial<RuntimeStoreFile>;
    if (!Array.isArray(obj.snapshots)) return emptyStore();
    return {
      schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : SCHEMA_VERSION,
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
      snapshots: obj.snapshots as StoredSnapshot[],
    };
  } catch {
    return emptyStore();
  }
}

/**
 * Append snapshot mới (đã validate + có snapshotId). Dedupe theo snapshotId
 * (vs existing + trong payload). Ghi atomic. KHÔNG overwrite duplicate ở 02B.
 */
export function appendSnapshots(incoming: StoredSnapshot[]): AppendResult {
  const p = runtimePath();
  if (!p) return { ok: false, savedCount: 0, duplicateIds: [], totalAfter: 0 };

  const store = readRuntimeStore();
  const existingIds = new Set(store.snapshots.map((s) => s.snapshotId));
  const duplicateIds: string[] = [];
  const toAdd: StoredSnapshot[] = [];

  for (const s of incoming) {
    if (existingIds.has(s.snapshotId)) {
      duplicateIds.push(s.snapshotId);
      continue;
    }
    existingIds.add(s.snapshotId);
    toAdd.push(s);
  }

  const next: RuntimeStoreFile = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    snapshots: [...store.snapshots, ...toAdd],
  };

  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    renameSync(tmp, p);
  } catch {
    return { ok: false, savedCount: 0, duplicateIds, totalAfter: store.snapshots.length };
  }

  return { ok: true, savedCount: toAdd.length, duplicateIds, totalAfter: next.snapshots.length };
}
