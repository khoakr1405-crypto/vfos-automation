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
import type {
  ApiPerformanceSnapshot,
  ManualPerformanceSnapshot,
  PublishedPost,
  ShopeeRevenueSnapshot,
} from './types';

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
 * (vs existing + trong payload). Ghi file dạng atomic append/update store.
 * KHÔNG ghi đè (overwrite) duplicate (skip/reject nếu trùng snapshotId).
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

/* =============================================================================
 * Published posts store (G4 — Revenue Attribution §4 B.1)
 * -----------------------------------------------------------------------------
 * Index runtime materialize từ artifact publish đã có trên đĩa (KHÔNG phải nguồn
 * sự thật duy nhất — resolver có fallback derive-on-read). Append-only, dedupe
 * theo publishedPostId (pp_<jobId>, idempotent — re-publish là no-op).
 * ========================================================================== */

const PUBLISHED_POSTS_REL = join('data', 'growth', 'runtime', 'published-posts.json');

export interface PublishedPostsStoreFile {
  schemaVersion: number;
  updatedAt: string;
  posts: PublishedPost[];
}

function publishedPostsPath(): string | null {
  return resolveInsideRepo(PUBLISHED_POSTS_REL);
}

function emptyPublishedPostsStore(): PublishedPostsStoreFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), posts: [] };
}

/** Đọc store published posts. Never-throw → empty nếu thiếu/hỏng/sai shape. */
export function readPublishedPostsStore(): PublishedPostsStoreFile {
  const p = publishedPostsPath();
  if (!p || !existsSync(p)) return emptyPublishedPostsStore();
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyPublishedPostsStore();
    const obj = parsed as Partial<PublishedPostsStoreFile>;
    if (!Array.isArray(obj.posts)) return emptyPublishedPostsStore();
    return {
      schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : SCHEMA_VERSION,
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
      posts: obj.posts as PublishedPost[],
    };
  } catch {
    return emptyPublishedPostsStore();
  }
}

/**
 * Append PublishedPost mới (atomic tmp→rename). Dedupe theo publishedPostId —
 * KHÔNG overwrite record đã có (publish lần 2 cùng job = duplicate, skip).
 */
export function appendPublishedPosts(incoming: PublishedPost[]): AppendResult {
  const p = publishedPostsPath();
  if (!p) return { ok: false, savedCount: 0, duplicateIds: [], totalAfter: 0 };

  const store = readPublishedPostsStore();
  const existingIds = new Set(store.posts.map((x) => x.publishedPostId));
  const duplicateIds: string[] = [];
  const toAdd: PublishedPost[] = [];

  for (const post of incoming) {
    if (existingIds.has(post.publishedPostId)) {
      duplicateIds.push(post.publishedPostId);
      continue;
    }
    existingIds.add(post.publishedPostId);
    toAdd.push(post);
  }

  const next: PublishedPostsStoreFile = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    posts: [...store.posts, ...toAdd],
  };

  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    renameSync(tmp, p);
  } catch {
    return { ok: false, savedCount: 0, duplicateIds, totalAfter: store.posts.length };
  }

  return { ok: true, savedCount: toAdd.length, duplicateIds, totalAfter: next.posts.length };
}

/* =============================================================================
 * Shopee revenue store (G1 — Revenue Attribution §5-C C.2 lớp Storage)
 * -----------------------------------------------------------------------------
 * Lưu ShopeeRevenueSnapshot đã ingest (manual_csv). Atomic tmp→rename, dedupe
 * theo snapshotId deterministic → re-import cùng file CSV là no-op (idempotent).
 * ========================================================================== */

const SHOPEE_REVENUE_REL = join('data', 'growth', 'runtime', 'shopee-revenue-snapshots.json');

export interface ShopeeRevenueStoreFile {
  schemaVersion: number;
  updatedAt: string;
  snapshots: ShopeeRevenueSnapshot[];
}

function shopeeRevenuePath(): string | null {
  return resolveInsideRepo(SHOPEE_REVENUE_REL);
}

function emptyShopeeRevenueStore(): ShopeeRevenueStoreFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), snapshots: [] };
}

/** Đọc store doanh thu Shopee. Never-throw → empty nếu thiếu/hỏng/sai shape. */
export function readShopeeRevenueStore(): ShopeeRevenueStoreFile {
  const p = shopeeRevenuePath();
  if (!p || !existsSync(p)) return emptyShopeeRevenueStore();
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyShopeeRevenueStore();
    const obj = parsed as Partial<ShopeeRevenueStoreFile>;
    if (!Array.isArray(obj.snapshots)) return emptyShopeeRevenueStore();
    return {
      schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : SCHEMA_VERSION,
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
      snapshots: obj.snapshots as ShopeeRevenueSnapshot[],
    };
  } catch {
    return emptyShopeeRevenueStore();
  }
}

/** Append snapshot Shopee mới (atomic). Dedupe theo snapshotId — không overwrite. */
export function appendShopeeRevenueSnapshots(incoming: ShopeeRevenueSnapshot[]): AppendResult {
  const p = shopeeRevenuePath();
  if (!p) return { ok: false, savedCount: 0, duplicateIds: [], totalAfter: 0 };

  const store = readShopeeRevenueStore();
  const existingIds = new Set(store.snapshots.map((s) => s.snapshotId));
  const duplicateIds: string[] = [];
  const toAdd: ShopeeRevenueSnapshot[] = [];

  for (const s of incoming) {
    if (existingIds.has(s.snapshotId)) {
      duplicateIds.push(s.snapshotId);
      continue;
    }
    existingIds.add(s.snapshotId);
    toAdd.push(s);
  }

  const next: ShopeeRevenueStoreFile = {
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

/* =============================================================================
 * API Performance Store Helpers (Round Real API 02B)
 * ========================================================================== */

const API_RUNTIME_REL = join('data', 'growth', 'runtime', 'api-performance-snapshots.json');

export interface ApiRuntimeStoreFile {
  schemaVersion: number;
  updatedAt: string;
  snapshots: ApiPerformanceSnapshot[];
}

function apiRuntimePath(): string | null {
  return resolveInsideRepo(API_RUNTIME_REL);
}

export function apiRuntimePathConfigured(): boolean {
  return apiRuntimePath() !== null;
}

function emptyApiStore(): ApiRuntimeStoreFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), snapshots: [] };
}

export function readApiRuntimeStore(): ApiRuntimeStoreFile {
  const p = apiRuntimePath();
  if (!p || !existsSync(p)) return emptyApiStore();
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyApiStore();
    const obj = parsed as Partial<ApiRuntimeStoreFile>;
    if (!Array.isArray(obj.snapshots)) return emptyApiStore();
    return {
      schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : SCHEMA_VERSION,
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
      snapshots: obj.snapshots as ApiPerformanceSnapshot[],
    };
  } catch {
    return emptyApiStore();
  }
}

/**
 * Append API performance snapshots mới. Thực hiện atomic append/update store.
 * Kiểm tra trùng lặp và skip/reject nếu trùng snapshotId, tuyệt đối không overwrite.
 */
export function appendApiPerformanceSnapshots(incoming: ApiPerformanceSnapshot[]): AppendResult {
  const p = apiRuntimePath();
  if (!p) return { ok: false, savedCount: 0, duplicateIds: [], totalAfter: 0 };

  const store = readApiRuntimeStore();
  const existingIds = new Set(store.snapshots.map((s) => s.snapshotId));
  const duplicateIds: string[] = [];
  const toAdd: ApiPerformanceSnapshot[] = [];

  for (const s of incoming) {
    if (existingIds.has(s.snapshotId)) {
      duplicateIds.push(s.snapshotId);
      continue;
    }
    existingIds.add(s.snapshotId);
    toAdd.push(s);
  }

  const next: ApiRuntimeStoreFile = {
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
