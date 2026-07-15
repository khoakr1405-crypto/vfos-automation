/* =============================================================================
 * VFOS Studio — TikTok Shop paste-link → Product Card (Studio Commerce 02)
 * -----------------------------------------------------------------------------
 * POST local-only { url, name, price?, commissionPct? } — Phần 76 (đảo defer
 * TikTok Shop của Phần 22, lệnh trực tiếp Operator). Operator DÁN LINK TikTok
 * Shop thủ công: KHÔNG scraper, KHÔNG CDP, KHÔNG gọi API TikTok thật — route
 * chỉ validate (host allowlist + strip sạch query/hash chống tracking token)
 * rồi ghi Product Card `platform: 'tiktok-shop'` với validationStatus
 * OPERATOR_CONFIRMED (mức tin cậy THỦ CÔNG — không phải VERIFIED máy móc).
 *
 * GHI ĐÈ CHỦ ĐÍCH: data/temp/selected_product_card.json là slot ĐƠN
 * "sản phẩm hiện tại" — Operator chọn cái mới nhất; card Shopee/TikTok trước
 * đó bị thay là hành vi đúng thiết kế (giống promote từ registry Shopee).
 * ========================================================================== */

import { writeFileSync } from 'node:fs';
import { buildTikTokShopCard } from '@/lib/commerce/tiktok-shop';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const CARD_REL = 'data/temp/selected_product_card.json';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

interface PasteLinkBody {
  url?: unknown;
  name?: unknown;
  price?: unknown;
  commissionPct?: unknown;
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }

  let body: PasteLinkBody;
  try {
    body = (await req.json()) as PasteLinkBody;
  } catch {
    return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 });
  }

  const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
  if (sensitive.length > 0) {
    return Response.json(
      { ok: false, code: 'SENSITIVE_REJECTED', fields: sensitive },
      { status: 400 },
    );
  }

  const built = buildTikTokShopCard({
    name: typeof body.name === 'string' ? body.name : '',
    url: typeof body.url === 'string' ? body.url : '',
    price: typeof body.price === 'string' ? body.price : null,
    commissionPct: typeof body.commissionPct === 'string' ? body.commissionPct : null,
  });
  if (!built.ok) {
    return Response.json({ ok: false, code: built.code, message: built.message }, { status: 400 });
  }

  const cardAbs = resolveInsideRepo(CARD_REL);
  if (!cardAbs) {
    return Response.json({ ok: false, code: 'PATH_RESOLVE_FAILED' }, { status: 500 });
  }
  try {
    // Ghi đè slot card hiện tại là CHỦ ĐÍCH (xem header) — cùng cơ chế ghi
    // với shopee-card-from-registry: JSON 2-space indent + newline cuối file.
    writeFileSync(cardAbs, `${JSON.stringify(built.card, null, 2)}\n`, 'utf8');
  } catch {
    return Response.json(
      { ok: false, code: 'CARD_WRITE_FAILED', message: 'Không ghi được Product Card.' },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    productName: built.card.name,
    tiktokShopUrl: built.card.tiktokShopUrl,
    validationStatus: built.card.validationStatus,
  });
}
