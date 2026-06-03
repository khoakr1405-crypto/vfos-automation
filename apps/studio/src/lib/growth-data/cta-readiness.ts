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

import type {
  AffiliateCtaPlan,
  CtaMode,
  CtaReadiness,
  CtaSlot,
  CtaSlotStatus,
  FacebookHubStatus,
  LinkRole,
  ProductTagStatus,
} from './types';

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

/* ---- Transport-safe summary cho UI (Round Affiliate Hub 03) ---------------- */

/**
 * Tóm tắt 1 slot để gửi xuống client. KHÔNG kèm raw link (chỉ cờ hasLink) —
 * link công khai vẫn hiển thị ở product card, readiness card chỉ cần trạng thái.
 */
export interface CtaSlotSummary {
  role: LinkRole;
  status: CtaSlotStatus;
  hasLink: boolean;
  note: string | null;
}

/** Tóm tắt readiness CTA cho 1 job — transport-safe (không token/secret/raw link). */
export interface CtaReadinessSummary {
  jobId: string;
  ctaMode: CtaMode;
  readiness: CtaReadiness;
  facebookHubStatus: FacebookHubStatus;
  productTagStatus: ProductTagStatus;
  requiresManualTagging: boolean;
  primary: CtaSlotSummary;
  secondaries: CtaSlotSummary[];
  reply: CtaSlotSummary;
}

function toSlotSummary(slot: CtaSlot): CtaSlotSummary {
  return {
    role: slot.role,
    status: slot.status,
    hasLink: slot.link !== null,
    note: slot.note ?? null,
  };
}

/** Map AffiliateCtaPlan → summary. readiness lấy từ computeCtaReadiness (authoritative). */
export function toCtaReadinessSummary(plan: AffiliateCtaPlan): CtaReadinessSummary {
  return {
    jobId: plan.jobId,
    ctaMode: plan.ctaMode,
    readiness: computeCtaReadiness(plan),
    facebookHubStatus: plan.facebookHubStatus,
    productTagStatus: plan.productTagStatus,
    requiresManualTagging: plan.requiresManualTagging,
    primary: toSlotSummary(plan.primaryCta),
    secondaries: plan.secondaryCtas.map(toSlotSummary),
    reply: toSlotSummary(plan.replyCta),
  };
}
