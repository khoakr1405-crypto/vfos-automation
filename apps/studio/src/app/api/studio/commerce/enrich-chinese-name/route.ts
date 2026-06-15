/* =============================================================================
 * VFOS Studio — Enrich Chinese search keyword (hybrid layer 2 endpoint)
 * -----------------------------------------------------------------------------
 * POST local-only. Hybrid: (0) card đã có chineseSearchName → trả luôn; (1) dictionary
 * hit → persist + trả (KHÔNG gọi API); (2) dictionary MISS → Claude (raw fetch) → trả.
 * Operator-click-only (UI gọi khi bấm nút) — KHÔNG auto. Key vắng → NO_API_KEY graceful
 * (không throw). TUYỆT ĐỐI không log/echo key. Chỉ gửi TÊN sản phẩm tới Claude.
 *
 * PERSIST: (a) CURRENT card `data/temp/selected_product_card.json` (session) + (b) durable
 * store `data/cn-search-keywords.json` theo shopId_itemId (sống qua re-promote). KHÔNG
 * đụng shopee_link_registry (secret/CDP). KHÔNG overwrite giá trị tốt bằng null/rỗng.
 * ========================================================================== */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildChineseSearchName, isWeakChineseKeyword } from '@/lib/cn-search-keywords';
import { DEFAULT_CN_MODEL, enrichChineseNameViaLLM } from '@/lib/cn-search-llm';
import { writeDurableKeyword } from '@/lib/cn-search-store';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const CARD_REL = 'data/temp/selected_product_card.json';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

/** Đọc 1 biến .env (chỉ ANTHROPIC_*). process.env trước, fallback đọc file .env.
 * KHÔNG trả/không log giá trị ra ngoài — chỉ dùng nội bộ để gọi API. */
function readEnvVar(name: string): string {
  const fromProc = (process.env[name] ?? '').trim();
  if (fromProc) return fromProc;
  const envAbs = resolveInsideRepo('.env');
  if (!envAbs || !existsSync(envAbs)) return '';
  try {
    for (const line of readFileSync(envAbs, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1 || t.slice(0, i).trim() !== name) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v.trim();
    }
  } catch {}
  return '';
}

function readCard(): { abs: string; card: Record<string, unknown> } | null {
  const abs = resolveInsideRepo(CARD_REL);
  if (!abs || !existsSync(abs)) return null;
  try {
    return { abs, card: JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** Ghi keyword (zh) + cụm lõi VI vào current card. Best-effort; trả true nếu ghi xong.
 * coreVi rỗng → KHÔNG ghi field (giữ card gọn, không tạo field rác). */
function persistToCard(
  abs: string,
  card: Record<string, unknown>,
  keyword: string,
  coreVi: string,
): boolean {
  try {
    const next: Record<string, unknown> = { ...card, chineseSearchName: keyword };
    if (coreVi) next.vietnameseCoreKeyword = coreVi;
    writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, reason: 'NOT_LOCAL', message: 'Chỉ cho phép gọi từ local dev.' },
      { status: 403 },
    );
  }

  const read = readCard();
  if (!read) {
    return Response.json(
      { ok: false, reason: 'NO_CARD', message: 'Chưa có Product Card.' },
      { status: 400 },
    );
  }
  const { abs, card } = read;
  const name = String(card.name ?? '').trim();
  if (!name) {
    return Response.json({ ok: false, reason: 'EMPTY_NAME' }, { status: 400 });
  }
  // Product identity (public) để ghi store bền — sống qua mọi lần đổi/re-promote card.
  const shopId = String(card.shopId ?? '');
  const itemId = String(card.itemId ?? '');

  // (0) Card đã có giá trị HOÀN CHỈNH: zh non-weak (ràng buộc 2: re-validate, loại
  // feature-only như 防晒) VÀ có coreVi (ràng buộc 3) → trả luôn, KHÔNG gọi API.
  const existingZh =
    typeof card.chineseSearchName === 'string' ? card.chineseSearchName.trim() : '';
  const existingVi =
    typeof card.vietnameseCoreKeyword === 'string' ? card.vietnameseCoreKeyword.trim() : '';
  if (existingZh && !isWeakChineseKeyword(existingZh) && existingVi) {
    const durable = writeDurableKeyword(shopId, itemId, existingZh, 'llm', existingVi);
    return Response.json({
      ok: true,
      keyword: existingZh,
      coreVi: existingVi,
      source: 'card',
      persisted: false,
      durable,
    });
  }

  // Defense-in-depth: không gửi tên có shape nhạy cảm tới API ngoài.
  if (findSensitiveTerms(name).length > 0) {
    return Response.json({ ok: false, reason: 'INVALID_OUTPUT' }, { status: 200 });
  }

  // (1) AI rút gọn + dịch (ƯU TIÊN — cho cả coreVi + zh sát nghĩa). Loại zh feature-only.
  const apiKey = readEnvVar('ANTHROPIC_API_KEY');
  if (apiKey) {
    const model = readEnvVar('ANTHROPIC_MODEL') || DEFAULT_CN_MODEL;
    const result = await enrichChineseNameViaLLM(name, { apiKey, model });
    if (result.ok && result.keyword && !isWeakChineseKeyword(result.keyword)) {
      const coreVi = (result.coreVi ?? '').trim();
      const persisted = persistToCard(abs, card, result.keyword, coreVi);
      const durable = writeDurableKeyword(shopId, itemId, result.keyword, 'llm', coreVi);
      return Response.json({
        ok: true,
        keyword: result.keyword,
        coreVi: coreVi || null,
        source: 'llm',
        persisted,
        persistTarget: 'current-card',
        durable,
      });
    }
    // AI fail / trả feature-only → rớt xuống dictionary fallback bên dưới.
  }

  // (2) Fallback offline: dictionary CHỈ khi MẠNH (non-weak) (ràng buộc 1). Không có
  // coreVi → client vẫn thấy nút AI để hoàn thiện (ràng buộc 3).
  const dict = buildChineseSearchName(name);
  if (dict && !isWeakChineseKeyword(dict)) {
    const persisted = persistToCard(abs, card, dict, '');
    const durable = writeDurableKeyword(shopId, itemId, dict, 'dictionary');
    return Response.json({
      ok: true,
      keyword: dict,
      coreVi: null,
      source: 'dictionary',
      persisted,
      persistTarget: 'current-card',
      durable,
    });
  }

  // (3) Không có nguồn nào ra kết quả mạnh.
  if (!apiKey) return Response.json({ ok: false, reason: 'NO_API_KEY' }, { status: 200 });
  return Response.json({ ok: false, reason: 'INVALID_OUTPUT' }, { status: 200 });
}
