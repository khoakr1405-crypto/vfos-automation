/* =============================================================================
 * VFOS Studio — Durable store cho chineseSearchName (Option B, SERVER ONLY)
 * -----------------------------------------------------------------------------
 * Lưu từ khóa tìm kiếm tiếng Trung BỀN theo product identity (shopId_itemId), độc
 * lập với current card `selected_product_card.json` (vốn bị ghi đè khi re-promote).
 * File: data/cn-search-keywords.json (gitignored qua `data/`). KHÔNG chứa secret —
 * chỉ keyword (text public) + identity public. Never-throw đọc; atomic ghi; KHÔNG
 * lưu keyword rỗng, KHÔNG overwrite bằng rỗng. KHÔNG đụng shopee_link_registry/CDP.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveInsideRepo } from './studio-data/paths';

const STORE_REL = 'data/cn-search-keywords.json';
const SCHEMA_VERSION = 1;

export type CnKeywordSource = 'dictionary' | 'llm';

interface CnKeywordEntry {
  keyword: string;
  /** Cụm lõi tiếng Việt đã rút gọn (optional — entry cũ không có vẫn đọc được). */
  keywordVi?: string;
  source: CnKeywordSource;
  updatedAt: string;
}

interface CnKeywordStoreFile {
  schemaVersion: number;
  updatedAt: string;
  entries: Record<string, CnKeywordEntry>;
}

function storePath(): string | null {
  return resolveInsideRepo(STORE_REL);
}

/** Key bền theo product identity. null nếu thiếu shopId/itemId (không tạo key rác). */
function keyOf(shopId: string, itemId: string): string | null {
  const s = (shopId || '').trim();
  const i = (itemId || '').trim();
  if (!s || !i) return null;
  return `${s}_${i}`;
}

function emptyStore(): CnKeywordStoreFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: '', entries: {} };
}

/** Đọc store. Never-throw → empty nếu thiếu/hỏng/sai shape. */
function readStore(): CnKeywordStoreFile {
  const p = storePath();
  if (!p || !existsSync(p)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<CnKeywordStoreFile>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.entries !== 'object' ||
      !parsed.entries
    ) {
      return emptyStore();
    }
    return {
      schemaVersion:
        typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : SCHEMA_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      entries: parsed.entries as Record<string, CnKeywordEntry>,
    };
  } catch {
    return emptyStore();
  }
}

/** Đọc keyword bền theo identity. null nếu chưa có / thiếu key / keyword rỗng. */
export function readDurableKeyword(
  shopId: string,
  itemId: string,
): { keyword: string; keywordVi: string | null; source: CnKeywordSource } | null {
  const key = keyOf(shopId, itemId);
  if (!key) return null;
  const e = readStore().entries[key];
  if (!e || typeof e.keyword !== 'string' || e.keyword.trim() === '') return null;
  const keywordVi =
    typeof e.keywordVi === 'string' && e.keywordVi.trim() !== '' ? e.keywordVi.trim() : null;
  return { keyword: e.keyword, keywordVi, source: e.source === 'llm' ? 'llm' : 'dictionary' };
}

/**
 * Ghi keyword bền (atomic tmp→rename). Bỏ qua nếu thiếu identity hoặc keyword rỗng
 * (KHÔNG overwrite giá trị tốt bằng rỗng). Trả true nếu ghi xong.
 */
export function writeDurableKeyword(
  shopId: string,
  itemId: string,
  keyword: string,
  source: CnKeywordSource,
  keywordVi?: string,
): boolean {
  const key = keyOf(shopId, itemId);
  const kw = (keyword || '').trim();
  if (!key || !kw) return false;
  const p = storePath();
  if (!p) return false;

  const store = readStore();
  const now = new Date().toISOString();
  const viCore = (keywordVi || '').trim();
  store.entries[key] = { keyword: kw, source, updatedAt: now, ...(viCore ? { keywordVi: viCore } : {}) };
  store.schemaVersion = SCHEMA_VERSION;
  store.updatedAt = now;

  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    renameSync(tmp, p);
    return true;
  } catch {
    return false;
  }
}
