/* =============================================================================
 * VFOS Studio — Enrich Chinese search keyword (hybrid layer 2 endpoint)
 * -----------------------------------------------------------------------------
 * POST local-only. Hybrid: (0) card đã có chineseSearchName → trả luôn; (1) dictionary
 * hit → persist + trả (KHÔNG gọi API); (2) dictionary MISS → Claude (raw fetch) → trả.
 * Operator-click-only (UI gọi khi bấm nút) — KHÔNG auto. Key vắng → NO_API_KEY graceful
 * (không throw). TUYỆT ĐỐI không log/echo key. Chỉ gửi TÊN sản phẩm tới Claude.
 *
 * PERSIST: ghi vào CURRENT card `data/temp/selected_product_card.json` (gitignored) —
 * đây là persist current-card/session. Shopee link registry hiện KHÔNG có field
 * chineseSearchName → vòng này CHƯA cập nhật durable registry (báo rõ trong response).
 * KHÔNG overwrite giá trị tốt bằng null (chỉ ghi khi có keyword hợp lệ).
 * ========================================================================== */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildChineseSearchName } from '@/lib/cn-search-keywords';
import { DEFAULT_CN_MODEL, enrichChineseNameViaLLM } from '@/lib/cn-search-llm';
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

/** Ghi keyword vào current card (never null). Best-effort; trả true nếu ghi xong. */
function persistToCard(abs: string, card: Record<string, unknown>, keyword: string): boolean {
  try {
    writeFileSync(
      abs,
      `${JSON.stringify({ ...card, chineseSearchName: keyword }, null, 2)}\n`,
      'utf8',
    );
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

  // (0) Card đã có giá trị tốt → trả luôn, KHÔNG gọi API, KHÔNG overwrite.
  const existing = typeof card.chineseSearchName === 'string' ? card.chineseSearchName.trim() : '';
  if (existing) {
    return Response.json({ ok: true, keyword: existing, source: 'card', persisted: false });
  }

  // (1) Dictionary hit → persist + trả, KHÔNG gọi API.
  const dict = buildChineseSearchName(name);
  if (dict) {
    const persisted = persistToCard(abs, card, dict);
    return Response.json({
      ok: true,
      keyword: dict,
      source: 'dictionary',
      persisted,
      persistTarget: 'current-card',
      durableRegistry: false,
    });
  }

  // Defense-in-depth: không gửi tên có shape nhạy cảm tới API ngoài.
  if (findSensitiveTerms(name).length > 0) {
    return Response.json({ ok: false, reason: 'INVALID_OUTPUT' }, { status: 200 });
  }

  // (2) Dictionary MISS → Claude. Key vắng → NO_API_KEY graceful (không throw).
  const apiKey = readEnvVar('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return Response.json({ ok: false, reason: 'NO_API_KEY' }, { status: 200 });
  }
  const model = readEnvVar('ANTHROPIC_MODEL') || DEFAULT_CN_MODEL;

  const result = await enrichChineseNameViaLLM(name, { apiKey, model });
  if (!result.ok || !result.keyword) {
    return Response.json({ ok: false, reason: result.reason ?? 'API_ERROR' }, { status: 200 });
  }

  // Chỉ persist khi có keyword hợp lệ — không overwrite bằng null.
  const persisted = persistToCard(abs, card, result.keyword);
  return Response.json({
    ok: true,
    keyword: result.keyword,
    source: 'llm',
    persisted,
    persistTarget: 'current-card',
    durableRegistry: false,
  });
}
