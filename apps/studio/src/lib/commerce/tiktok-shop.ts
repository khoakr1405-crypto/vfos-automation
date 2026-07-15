/* =============================================================================
 * VFOS Studio — TikTok Shop Product Card (paste-link manual — Commerce lib)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Chỉ import từ route handlers dưới app/api/studio/*.
 *
 * WHY: Phần 76 đảo quyết định defer của Phần 22 — Operator ra lệnh trực tiếp
 * mở lại TikTok-Shop-First ở mức R1: Operator DÁN LINK TikTok Shop thủ công.
 * KHÔNG scraper, KHÔNG CDP, KHÔNG gọi API TikTok thật — lib này chỉ chuẩn hoá
 * + gác cổng dữ liệu dán tay.
 *
 * `validationStatus: 'OPERATOR_CONFIRMED'` là mức tin cậy THỦ CÔNG — cố ý
 * KHÔNG dùng chữ 'VERIFIED' (chữ đó dành riêng cho máy móc Shopee CDP đã
 * xác thực owner). `dataConfidence: 'low'` theo tinh thần field
 * `data_confidence` của Phần 22: phản ánh trung thực mức verify của data.
 *
 * An toàn URL: host allowlist so khớp TUYỆT ĐỐI (không match đuôi lỏng lẻo)
 * + CẮT SẠCH query string / hash — link share TikTok mang tracking token
 * (`?_r=`, `_t=`, share-token…) — quy tắc giống việc cấm canonicalUrl Shopee.
 * ========================================================================== */

export interface TikTokShopProductCard {
  platform: 'tiktok-shop';
  name: string;
  tiktokShopUrl: string;
  price: string | null;
  commissionPct: string | null;
  source: 'operator_manual_paste';
  validationStatus: 'OPERATOR_CONFIRMED';
  dataConfidence: 'low';
  createdAt: string;
  chineseSearchName: null;
}

export const TIKTOK_SHOP_HOSTS = [
  'vt.tiktok.com',
  'vm.tiktok.com',
  'www.tiktok.com',
  'shop-vn.tiktok.com',
  'shop.tiktok.com',
] as const;

const MAX_PATHNAME_LENGTH = 200;
const NAME_MIN_LENGTH = 3;
const NAME_MAX_LENGTH = 120;
const OPTIONAL_FIELD_MAX_LENGTH = 40;

/**
 * Chuẩn hoá URL TikTok Shop dán tay: https + host thuộc allowlist (so sánh
 * lowercase, dùng `url.host` nên port lạ cũng bị loại) + pathname sạch.
 * Output = origin + pathname — query/hash bị CẮT SẠCH chủ đích.
 */
export function sanitizeTikTokShopUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'URL không parse được.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Chỉ chấp nhận URL https.' };
  }
  const host = parsed.host.toLowerCase();
  if (!(TIKTOK_SHOP_HOSTS as readonly string[]).includes(host)) {
    return { ok: false, reason: `Host "${host}" không thuộc allowlist TikTok Shop.` };
  }
  if (parsed.pathname.includes('..')) {
    return { ok: false, reason: 'Pathname chứa ".." — bị chặn.' };
  }
  if (parsed.pathname.length > MAX_PATHNAME_LENGTH) {
    return { ok: false, reason: `Pathname vượt quá ${MAX_PATHNAME_LENGTH} ký tự.` };
  }
  return { ok: true, url: `${parsed.origin}${parsed.pathname}` };
}

function normalizeOptionalField(
  value: string | null | undefined,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > OPTIONAL_FIELD_MAX_LENGTH) return { ok: false };
  return { ok: true, value: trimmed };
}

/** Dựng Product Card TikTok Shop từ input dán tay đã qua validate. */
export function buildTikTokShopCard(input: {
  name: string;
  url: string;
  price?: string | null;
  commissionPct?: string | null;
}): { ok: true; card: TikTokShopProductCard } | { ok: false; code: string; message: string } {
  const name = input.name.trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      code: 'BAD_NAME',
      message: `Tên sản phẩm phải từ ${NAME_MIN_LENGTH} đến ${NAME_MAX_LENGTH} ký tự.`,
    };
  }
  const sanitized = sanitizeTikTokShopUrl(input.url);
  if (!sanitized.ok) {
    return { ok: false, code: 'BAD_URL', message: sanitized.reason };
  }
  const price = normalizeOptionalField(input.price);
  if (!price.ok) {
    return {
      ok: false,
      code: 'BAD_PRICE',
      message: `price tối đa ${OPTIONAL_FIELD_MAX_LENGTH} ký tự.`,
    };
  }
  const commissionPct = normalizeOptionalField(input.commissionPct);
  if (!commissionPct.ok) {
    return {
      ok: false,
      code: 'BAD_COMMISSION_PCT',
      message: `commissionPct tối đa ${OPTIONAL_FIELD_MAX_LENGTH} ký tự.`,
    };
  }
  return {
    ok: true,
    card: {
      platform: 'tiktok-shop',
      name,
      tiktokShopUrl: sanitized.url,
      price: price.value,
      commissionPct: commissionPct.value,
      source: 'operator_manual_paste',
      validationStatus: 'OPERATOR_CONFIRMED',
      dataConfidence: 'low',
      createdAt: new Date().toISOString(),
      chineseSearchName: null,
    },
  };
}
