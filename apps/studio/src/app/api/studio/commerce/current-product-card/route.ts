/* =============================================================================
 * VFOS Studio — Current Product Card read API (Studio UI Action Wiring 01)
 * -----------------------------------------------------------------------------
 * GET local-only. Reads the current selected Product Card
 * (data/temp/selected_product_card.json) and returns a SANITIZED projection for
 * the /create form. NEVER returns canonicalUrl / canonicalCleanUrl (they can
 * carry credential_token / gads_t_sig). Read-only — no click, no browser, no
 * live extraction, no Shopee API, no job creation.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { buildChineseSearchName } from '@/lib/cn-search-keywords';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const EXPECTED_OWNER = 'an_17376660568';
const CARD_REL = 'data/temp/selected_product_card.json';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface CardSummary {
  name: string;
  shopId: string;
  itemId: string;
  shortLink: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  validationStatus: string;
  score?: number;
  commissionRate?: string;
  price?: string;
  productImageUrl: string | null;
  description: string | null;
  // Display-only: từ khóa tìm kiếm tiếng Trung SÁT NGHĨA suy ra từ tên VI (local,
  // no API). KHÔNG ảnh hưởng job binding — chỉ giúp Operator tìm source.
  chineseSearchName: string | null;
}

/** Plain product text (name/description) — trim + cap length. Local-only read;
 * product copy is not credential-shaped, so just bound the size. */
function safeText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Defense-in-depth guard for the product image URL before echoing to the client.
 * The bridge/builder already sanitise via @vfos/shopee sanitizeProductImageUrl;
 * this keeps a minimal local check (not the full token list) so the route never
 * leaks a credential/tracking-shaped URL even if a stale card slips through.
 */
function safeImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  if (/credential|token|session|cookie|signature|mmp_pid|utm_|label|badge|icon|logo|\.svg/i.test(s)) return null;
  return s;
}

/** Extract commission% / price from scoringCriteria, e.g.
 * "commission_high(80%), price_sweet(156750đ), sales_unknown". Never throws. */
function parseScoring(criteria?: string): { commissionRate?: string; price?: string } {
  if (!criteria) return {};
  const out: { commissionRate?: string; price?: string } = {};
  const comm = criteria.match(/(\d+(?:\.\d+)?)\s*%/);
  if (comm) out.commissionRate = `${comm[1]}%`;
  const price = criteria.match(/price_\w+\((\d+)\s*đ\)/);
  if (price) {
    const n = Number.parseInt(price[1], 10);
    if (Number.isFinite(n)) out.price = `${n.toLocaleString('vi-VN')}đ`;
  }
  return out;
}

function readCurrentCard(): CardSummary | null {
  const abs = resolveInsideRepo(CARD_REL);
  if (!abs || !existsSync(abs)) return null;
  try {
    const c = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown>;
    const affiliateOwnerId = String(c.affiliateOwnerId ?? '');
    const { commissionRate, price } = parseScoring(
      typeof c.scoringCriteria === 'string' ? c.scoringCriteria : undefined,
    );
    // Tên Trung: ưu tiên giá trị đã persist trong card; nếu chưa có (card cũ),
    // suy luận lại cục bộ. Read-only — không ghi ngược file ở route GET này.
    const persistedZh = typeof c.chineseSearchName === 'string' ? c.chineseSearchName.trim() : '';
    const chineseSearchName = persistedZh || buildChineseSearchName(String(c.name ?? ''));
    // Sanitized projection — never echo canonicalUrl / canonicalCleanUrl.
    return {
      name: String(c.name ?? ''),
      shopId: String(c.shopId ?? ''),
      itemId: String(c.itemId ?? ''),
      shortLink: String(c.shortLink ?? ''),
      affiliateOwnerId,
      ownerVerified: affiliateOwnerId === EXPECTED_OWNER,
      validationStatus: String(c.validationStatus ?? 'UNKNOWN'),
      productImageUrl: safeImageUrl(c.productImageUrl),
      description: safeText(c.description, 500),
      chineseSearchName: chineseSearchName || null,
      ...(typeof c.score === 'number' ? { score: c.score } : {}),
      ...(commissionRate ? { commissionRate } : {}),
      ...(price ? { price } : {}),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép đọc từ local dev.' },
      { status: 403 },
    );
  }

  const card = readCurrentCard();
  return Response.json({
    ok: true,
    expectedOwner: EXPECTED_OWNER,
    hasCard: card !== null,
    card,
    checkedAt: new Date().toISOString(),
  });
}
