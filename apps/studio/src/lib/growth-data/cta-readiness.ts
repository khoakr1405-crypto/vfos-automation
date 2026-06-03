/* =============================================================================
 * VFOS Studio — Affiliate CTA readiness logic (Round Affiliate Hub 02)
 * -----------------------------------------------------------------------------
 * PURE logic. KHÔNG import node:*. An toàn cho client component (Hub 03) và smoke.
 * Readiness TÙY ctaMode — KHÔNG ép mọi video có 2–3 link.
 *
 * Quy ước slot:
 *   - status === 'ready'   → link hợp lệ, dùng được.
 *   - status === 'invalid' → owner/link sai (owner mismatch / chưa verify) → CHẶN.
 *   - status === 'missing' | 'not_applicable' → chưa có / không áp dụng (không chặn).
 *
 * Rule (khớp plan Affiliate Hub v2):
 *   blocked (mọi mode): owner/link Primary invalid HOẶC không có CTA hợp lệ nào.
 *   SINGLE_PRODUCT_REVIEW: ready = Primary hợp lệ + reply policy intent-gated
 *     (secondaryCtas có thể RỖNG); partial = chưa có Primary nhưng có Secondary hợp lệ.
 *   MULTI_TOUCH_NICHE: ready = Primary hợp lệ + (≥1 Secondary hợp lệ HOẶC reply
 *     được trang bị link hợp lệ); partial = chỉ có Primary.
 *   CONTEXTUAL_CONTENT: flexible — ready = ≥1 CTA hợp lệ + reply policy intent-gated
 *     (Secondary optional). Mức "chưa khớp bối cảnh tối ưu" để round sau, chưa model.
 * ========================================================================== */

import type { AffiliateCtaPlan, CtaReadiness, CtaSlot } from './types';

function isReady(slot: CtaSlot): boolean {
  return slot.status === 'ready';
}

/** Tính readiness từ trạng thái các slot + ctaMode. Pure, deterministic. */
export function computeCtaReadiness(plan: AffiliateCtaPlan): CtaReadiness {
  const ownerLinkInvalid = plan.primaryCta.status === 'invalid';
  const primaryReady = isReady(plan.primaryCta);
  const secondaryReady = plan.secondaryCtas.some(isReady);
  const replyPolicyOk = plan.replyLinkPolicy === 'intent_gated';
  const replyEquipped = isReady(plan.replyCta) && replyPolicyOk;
  const anyReady = primaryReady || secondaryReady || isReady(plan.replyCta);

  // Chặn chung: owner/link Primary sai, hoặc không CTA nào hợp lệ.
  if (ownerLinkInvalid || !anyReady) return 'blocked';

  switch (plan.ctaMode) {
    case 'SINGLE_PRODUCT_REVIEW':
      if (primaryReady && replyPolicyOk) return 'ready';
      return 'partial'; // có Secondary/Reply hợp lệ nhưng chưa có Primary Hub
    case 'MULTI_TOUCH_NICHE':
      if (primaryReady && (secondaryReady || replyEquipped)) return 'ready';
      return 'partial'; // chỉ có Primary
    case 'CONTEXTUAL_CONTENT':
      if (anyReady && replyPolicyOk) return 'ready';
      return 'partial';
  }
}
