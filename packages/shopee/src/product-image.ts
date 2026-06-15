/* =============================================================================
 * VFOS Shopee — Product image URL picker (pure, testable)
 * -----------------------------------------------------------------------------
 * Chọn ĐÚNG ảnh sản phẩm từ danh sách candidate URL bắt được trên DOM card. Dùng
 * sanitizeProductImageUrl làm cổng loại badge/label/icon/credential/.svg; ưu tiên
 * URL CDN sản phẩm thật (susercontent / `/file/`); KHÔNG còn fallback sang badge —
 * không thấy ảnh thật → trả `null` (trung thực, để UI hiện "ảnh chưa có").
 * ========================================================================== */

import { sanitizeProductImageUrl } from './url-sanitize.js';

/**
 * Pick the real product-image URL from raw DOM candidates (in DOM order).
 * Each candidate passes through sanitizeProductImageUrl (rejects badge/label/icon/
 * logo/.svg + credential/session/tracking). Prefers a product-CDN-looking URL;
 * otherwise the first sanitised survivor. Returns null when none survive — NO
 * badge fallback (the old behaviour stored a label badge that downstream rejected).
 */
export function pickProductImageUrl(
  candidates: readonly (string | null | undefined)[],
): string | null {
  const safe: string[] = [];
  for (const c of candidates) {
    const s = sanitizeProductImageUrl(c);
    if (s && !safe.includes(s)) safe.push(s);
  }
  if (safe.length === 0) return null;
  const product = safe.find((u) => /susercontent\.com|\/file\//i.test(u));
  return product ?? safe[0] ?? null;
}
