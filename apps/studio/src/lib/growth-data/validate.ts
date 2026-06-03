/* =============================================================================
 * VFOS Studio — Growth OS data validators (Round Growth 02)
 * -----------------------------------------------------------------------------
 * PURE logic. KHÔNG import node:*. Dùng được cả ở smoke test lẫn server.
 * Ba nhóm kiểm tra:
 *   1. findSecretViolations  — quét cả KEY lẫn VALUE cho token/secret/credential...
 *   2. checkReferentialIntegrity — quan hệ giữa các entity hợp lệ.
 *   3. checkIntentTaxonomy   — enum intent hợp lệ + safe-auto vs escalate phân tách.
 * ========================================================================== */

import { computeCtaReadiness } from './cta-readiness';
import { ESCALATE_INTENTS, type GrowthSnapshot, SAFE_AUTO_INTENTS } from './types';

const SECONDARY_ROLES = new Set(['CAPTION_LINK', 'PINNED_COMMENT']);
const CTA_MODES = new Set(['SINGLE_PRODUCT_REVIEW', 'MULTI_TOUCH_NICHE', 'CONTEXTUAL_CONTENT']);

/** Các thuật ngữ nhạy cảm bị cấm xuất hiện ở key HOẶC value (case-insensitive). */
const SECRET_TERMS = [
  'token',
  'accesstoken',
  'access_token',
  'secret',
  'credential',
  'password',
  'cookie',
  'authorization',
  'bearer',
] as const;

function matchSecretTerm(input: string): string | null {
  const low = input.toLowerCase();
  for (const term of SECRET_TERMS) {
    if (low.includes(term)) return term;
  }
  return null;
}

/**
 * Đệ quy quét toàn bộ object/array. Trả về danh sách vi phạm (path + lý do).
 * Bắt được cả tên field nhạy cảm lẫn chuỗi value chứa thuật ngữ nhạy cảm.
 */
export function findSecretViolations(root: unknown): string[] {
  const violations: string[] = [];

  const walk = (val: unknown, path: string): void => {
    if (val === null || val === undefined) return;

    if (typeof val === 'string') {
      const hit = matchSecretTerm(val);
      if (hit) violations.push(`${path || '<root>'} → value chứa thuật ngữ nhạy cảm "${hit}"`);
      return;
    }

    if (typeof val !== 'object') return;

    if (Array.isArray(val)) {
      val.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }

    for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
      const hitKey = matchSecretTerm(key);
      if (hitKey)
        violations.push(
          `${path ? `${path}.` : ''}${key} → key chứa thuật ngữ nhạy cảm "${hitKey}"`,
        );
      walk(child, path ? `${path}.${key}` : key);
    }
  };

  walk(root, '');
  return violations;
}

/** Kiểm tra toàn bộ quan hệ tham chiếu giữa các entity. Trả về danh sách lỗi. */
export function checkReferentialIntegrity(snap: GrowthSnapshot): string[] {
  const errors: string[] = [];

  const channelIds = new Set(snap.channels.map((c) => c.channelId));
  const postIds = new Set(snap.publishedPosts.map((p) => p.publishedPostId));
  const commentIds = new Set(snap.commentItems.map((c) => c.commentId));
  const angleIds = new Set(snap.contentAngles.map((a) => a.angleId));
  const signalIds = new Set(snap.learningSignals.map((s) => s.signalId));
  const productIds = new Set(
    snap.publishedPosts.map((p) => p.productId).filter((x): x is string => x !== null),
  );

  for (const p of snap.postingPlans) {
    if (!channelIds.has(p.channelId)) {
      errors.push(`PostingPlan ${p.planId}: channelId "${p.channelId}" không tồn tại`);
    }
  }
  for (const p of snap.publishedPosts) {
    if (!channelIds.has(p.channelId)) {
      errors.push(`PublishedPost ${p.publishedPostId}: channelId "${p.channelId}" không tồn tại`);
    }
  }
  for (const m of snap.performanceMetrics) {
    if (!postIds.has(m.publishedPostId)) {
      errors.push(
        `PerformanceMetric ${m.metricId}: publishedPostId "${m.publishedPostId}" không tồn tại`,
      );
    }
  }
  for (const c of snap.commentItems) {
    if (!postIds.has(c.publishedPostId)) {
      errors.push(
        `CommentItem ${c.commentId}: publishedPostId "${c.publishedPostId}" không tồn tại`,
      );
    }
  }
  for (const ci of snap.commentIntents) {
    if (!commentIds.has(ci.commentId)) {
      errors.push(`CommentIntent: commentId "${ci.commentId}" không tồn tại`);
    }
  }
  for (const a of snap.commentActionLog) {
    if (!commentIds.has(a.commentId)) {
      errors.push(`CommentActionLog ${a.actionId}: commentId "${a.commentId}" không tồn tại`);
    }
  }
  for (const r of snap.growthRecommendations) {
    for (const sid of r.basedOnSignals) {
      if (!signalIds.has(sid)) {
        errors.push(`GrowthRecommendation ${r.recId}: signal "${sid}" không tồn tại`);
      }
    }
  }
  for (const s of snap.learningSignals) {
    const ok =
      (s.scope === 'post' && postIds.has(s.refId)) ||
      (s.scope === 'channel' && channelIds.has(s.refId)) ||
      (s.scope === 'angle' && angleIds.has(s.refId)) ||
      (s.scope === 'product' && productIds.has(s.refId));
    if (!ok) {
      errors.push(`LearningSignal ${s.signalId}: refId "${s.refId}" không khớp scope "${s.scope}"`);
    }
  }

  return errors;
}

/** Enum intent hợp lệ + isSafeForAuto khớp taxonomy + có cả safe lẫn escalate. */
export function checkIntentTaxonomy(snap: GrowthSnapshot): string[] {
  const errors: string[] = [];
  const safe = new Set<string>(SAFE_AUTO_INTENTS);
  const escalate = new Set<string>(ESCALATE_INTENTS);
  const all = new Set<string>([...SAFE_AUTO_INTENTS, ...ESCALATE_INTENTS]);

  for (const ci of snap.commentIntents) {
    if (!all.has(ci.intent)) {
      errors.push(`CommentIntent ${ci.commentId}: intent "${ci.intent}" không hợp lệ`);
      continue;
    }
    const expectedSafe = safe.has(ci.intent);
    if (ci.isSafeForAuto !== expectedSafe) {
      errors.push(
        `CommentIntent ${ci.commentId}: isSafeForAuto=${ci.isSafeForAuto} mâu thuẫn intent "${ci.intent}" (đúng: ${expectedSafe})`,
      );
    }
  }

  for (const t of snap.replyTemplates) {
    if (!all.has(t.intent)) {
      errors.push(`ReplyTemplate ${t.templateId}: intent "${t.intent}" không hợp lệ`);
    }
  }

  const seenSafe = snap.commentIntents.some((ci) => safe.has(ci.intent));
  const seenEscalate = snap.commentIntents.some((ci) => escalate.has(ci.intent));
  if (!seenSafe) errors.push('Taxonomy: fixtures thiếu ít nhất 1 intent an toàn (SAFE_AUTO)');
  if (!seenEscalate) errors.push('Taxonomy: fixtures thiếu ít nhất 1 intent escalate');

  return errors;
}

/**
 * Kiểm tra AffiliateCtaPlan (Round Affiliate Hub 02):
 *   - jobId không trùng.
 *   - ctaMode hợp lệ; vai trò từng slot đúng (Primary=HUB_NATIVE, Secondary∈caption/pinned,
 *     Reply=REPLY_LINK); replyLinkPolicy='intent_gated'.
 *   - readiness lưu khớp computeCtaReadiness (single source of truth cho rule).
 *   - Nếu jobId trùng 1 PublishedPost thì productId phải nhất quán.
 */
export function checkCtaPlanIntegrity(snap: GrowthSnapshot): string[] {
  const errors: string[] = [];
  const seenJobIds = new Set<string>();
  const postByJobId = new Map(snap.publishedPosts.map((p) => [p.jobId, p]));

  for (const plan of snap.affiliateCtaPlans) {
    const tag = `AffiliateCtaPlan ${plan.jobId}`;

    if (seenJobIds.has(plan.jobId)) errors.push(`${tag}: jobId trùng lặp`);
    seenJobIds.add(plan.jobId);

    if (!CTA_MODES.has(plan.ctaMode)) errors.push(`${tag}: ctaMode "${plan.ctaMode}" không hợp lệ`);

    if (plan.primaryCta.role !== 'HUB_NATIVE')
      errors.push(`${tag}: primaryCta.role phải là HUB_NATIVE (đang "${plan.primaryCta.role}")`);
    for (const s of plan.secondaryCtas) {
      if (!SECONDARY_ROLES.has(s.role))
        errors.push(`${tag}: secondaryCta.role "${s.role}" không hợp lệ (caption/pinned)`);
    }
    if (plan.replyCta.role !== 'REPLY_LINK')
      errors.push(`${tag}: replyCta.role phải là REPLY_LINK (đang "${plan.replyCta.role}")`);

    if (plan.replyLinkPolicy !== 'intent_gated')
      errors.push(`${tag}: replyLinkPolicy phải là 'intent_gated'`);

    const expected = computeCtaReadiness(plan);
    if (plan.readiness !== expected)
      errors.push(
        `${tag}: readiness="${plan.readiness}" mâu thuẫn rule ctaMode=${plan.ctaMode} (đúng: "${expected}")`,
      );

    const post = postByJobId.get(plan.jobId);
    if (post?.productId && plan.productId && post.productId !== plan.productId) {
      errors.push(
        `${tag}: productId "${plan.productId}" lệch PublishedPost "${post.productId}" cùng jobId`,
      );
    }
  }

  return errors;
}

/**
 * Trả về 2 nhóm intent để hiển thị/đối chiếu. Bọc qua function export để smoke
 * (ESM) lấy được mà không phụ thuộc named const-array export qua ranh giới CJS.
 */
export function intentTaxonomy(): { safeAuto: readonly string[]; escalate: readonly string[] } {
  return { safeAuto: SAFE_AUTO_INTENTS, escalate: ESCALATE_INTENTS };
}
