/* =============================================================================
 * VFOS Studio — Contextual affiliate owner SOFT-CHECK (lane Giải trí → Facebook)
 * -----------------------------------------------------------------------------
 * PURE (không node/fs, không @/ alias) → dùng được cả server (orchestrator ghi
 * warning vào summary) LẪN client (UI cảnh báo live khi Operator gõ link).
 *
 * Affiliate của lane Giải trí là CONTEXTUAL (tự chọn theo ngữ cảnh video), KHÔNG
 * phải Product Card bắt buộc, KHÔNG gate owner cứng. Đây chỉ là CẢNH BÁO MỀM:
 *   - Link không phải Shopee  → 'none'      (bỏ qua — link nền tảng khác hợp lệ)
 *   - Shopee + owner khớp     → 'ok'
 *   - Shopee + owner khác      → 'mismatch'  (cảnh báo có thể mất commission)
 *   - Shopee + không đọc được  → 'unverified' ("Chưa xác minh owner")
 * TUYỆT ĐỐI KHÔNG hard-block: Operator tự quyết đăng hay không.
 *
 * Owner đọc từ utm_source || mmp_pid — cùng quy ước classifyResolvedLink
 * (packages/shopee/src/cdp-extract-helpers.ts). Owner kỳ vọng =
 * production-gates.EXPECTED_OWNER (nhân bản literal để giữ module PURE).
 * ========================================================================== */

/** Canonical: khớp production-gates.EXPECTED_OWNER ('an_17376660568'). */
export const EXPECTED_AFFILIATE_OWNER = 'an_17376660568';

export type AffiliateOwnerStatus = 'none' | 'ok' | 'mismatch' | 'unverified';

export interface AffiliateOwnerCheck {
  isShopee: boolean;
  status: AffiliateOwnerStatus;
  owner: string | null;
  message: string;
}

function isShopeeHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.includes('shopee.') || h === 'shp.ee' || h.endsWith('.shp.ee');
}

/**
 * Soft-check owner của 1 affiliate link. Không throw, không IO. Dùng cho cảnh báo
 * mềm — KHÔNG chặn đăng.
 */
export function checkAffiliateLinkOwner(link: string | null | undefined): AffiliateOwnerCheck {
  const raw = (link ?? '').trim();
  if (!raw) return { isShopee: false, status: 'none', owner: null, message: '' };

  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }

  const looksShopee = url ? isShopeeHost(url.host) : /shopee\.|shp\.ee/i.test(raw);
  if (!looksShopee) {
    return {
      isShopee: false,
      status: 'none',
      owner: null,
      message: 'Link không phải Shopee — bỏ qua kiểm owner (contextual affiliate).',
    };
  }
  if (!url) {
    return {
      isShopee: true,
      status: 'unverified',
      owner: null,
      message: '⚠️ Link Shopee nhưng không đọc được — CHƯA XÁC MINH OWNER. Operator tự quyết.',
    };
  }

  const owner = (url.searchParams.get('utm_source') || url.searchParams.get('mmp_pid') || '').trim();
  if (!owner) {
    return {
      isShopee: true,
      status: 'unverified',
      owner: null,
      message: '⚠️ Link Shopee không có owner (utm_source/mmp_pid) — CHƯA XÁC MINH OWNER. Operator tự quyết.',
    };
  }
  if (owner === EXPECTED_AFFILIATE_OWNER) {
    return { isShopee: true, status: 'ok', owner, message: `✅ Owner khớp (${owner}).` };
  }
  return {
    isShopee: true,
    status: 'mismatch',
    owner,
    message: `⚠️ Owner link = ${owner} ≠ của anh (${EXPECTED_AFFILIATE_OWNER}). Có thể mất commission — Operator tự quyết (KHÔNG chặn).`,
  };
}
