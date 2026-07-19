/* =============================================================================
 * VFOS Studio — Entertainment lane → Facebook publish orchestration
 * -----------------------------------------------------------------------------
 * ĐỔI TARGET lane Giải trí: từ TikTok sang Facebook Reels. PURE (dependency-
 * injection, KHÔNG import alias @/) để test guard bằng mock deps/client, KHÔNG
 * gọi live API. Route wiring deps thật từ jobs.ts.
 *
 * Contextual affiliate (KHÁC Product Review):
 *   - KHÔNG bắt Product Card, KHÔNG dùng gate owner Shopee cứng.
 *   - Operator CÓ THỂ gắn affiliate link + CTA thủ công (tuỳ chọn). Có → chèn vào
 *     description đúng chỗ; không → đăng caption thường.
 *   - Owner Shopee chỉ CẢNH BÁO MỀM (affiliate-owner.ts), KHÔNG chặn.
 *
 * No-Go: publish là cổng tay (Operator bấm), KHÔNG auto-publish; KHÔNG mock-
 * success ở live (client mock đánh dấu mode='mock'); lỗi sanitize, KHÔNG lộ token.
 * ========================================================================== */

import { type AffiliateOwnerStatus, checkAffiliateLinkOwner } from './affiliate-owner';

export type FacebookPublishMode = 'mock' | 'live';

/** Tóm tắt đăng Facebook lưu vào manifest (ent_job.json.facebook). KHÔNG token. */
export interface EntFacebookPublishSummary {
  status: 'POSTING' | 'POSTED' | 'FAILED';
  mode: FacebookPublishMode;
  videoId?: string;
  permalinkUrl?: string;
  /** API publish confirmed ≠ public visibility (uploader để UNCONFIRMED). */
  publishVisibility?: 'UNCONFIRMED' | 'PUBLIC_CONFIRMED' | 'NOT_PUBLIC';
  captionUsed: string;
  descriptionUsed: string;
  /** Contextual affiliate (tuỳ chọn) — lưu để sau này đo doanh thu. */
  affiliateLinkUsed?: string | null;
  contextualCtaUsed?: string | null;
  /** Cảnh báo owner Shopee (mềm, không chặn) — null nếu không có. */
  affiliateOwnerStatus?: AffiliateOwnerStatus;
  affiliateOwnerWarning?: string | null;
  startedAt?: string;
  postedAt?: string;
  error?: { code: string; message: string } | null;
}

/** 4 đèn readiness cho UI (không token/secret). */
export interface EntFacebookReadiness {
  videoApproved: boolean;
  hasFinalVideo: boolean;
  hasCaption: boolean;
  facebookApiReady: boolean;
  notPosted: boolean;
  allReady: boolean;
}

export type FacebookPublishErrorCode =
  | 'NOT_FOUND'
  | 'NO_PREVIEW_GATE'
  | 'NO_FINAL'
  | 'NO_CAPTION'
  | 'ALREADY_POSTED'
  | 'PUBLISH_BUSY'
  | 'BUSY'
  | 'FACEBOOK_DISABLED'
  | 'FACEBOOK_NOT_CONFIGURED'
  | 'LIVE_NOT_ENABLED'
  | 'FACEBOOK_API_ERROR';

export type FacebookPublishOutcome =
  | { ok: true; summary: EntFacebookPublishSummary }
  | {
      ok: false;
      code: FacebookPublishErrorCode;
      message: string;
      summary?: EntFacebookPublishSummary;
    };

/** View tối giản của job mà publish cần (deps build từ manifest thật). */
export interface FacebookPublishJobView {
  jobId: string;
  state: string;
  previewApproved: boolean;
  finalVideoAbsPath: string | null;
  caption: string;
  hashtags: string[];
  facebookStatus?: 'POSTING' | 'POSTED' | 'FAILED' | null;
  facebookStartedAt?: string | null;
  pipelineBusyReason?: string | null;
}

export interface FacebookPublishClientInput {
  videoPath: string;
  description: string;
}
export interface FacebookPublishClientResult {
  ok: boolean;
  mode: FacebookPublishMode;
  videoId?: string;
  permalinkUrl?: string;
  publishVisibility?: 'UNCONFIRMED';
  error?: { code: string; message: string };
}
export interface FacebookPublishClient {
  publishReel(input: FacebookPublishClientInput): Promise<FacebookPublishClientResult>;
}

export type ResolveFbClientResult =
  | { ok: true; client: FacebookPublishClient; mode: FacebookPublishMode }
  | {
      ok: false;
      code: 'FACEBOOK_DISABLED' | 'FACEBOOK_NOT_CONFIGURED' | 'LIVE_NOT_ENABLED';
      message: string;
    };

export interface FacebookPublishDeps {
  loadJob(id: string): FacebookPublishJobView | null;
  /** Ghi caption (đã sửa) vào package trước khi đăng — proof caption cuối. */
  saveCaption(id: string, caption: string, hashtags: string[]): void;
  /** Ghi facebook summary vào manifest. */
  setStatus(id: string, summary: EntFacebookPublishSummary): void;
  /** Resolve client (mock/live) theo env — KHÔNG trả token. */
  resolveClient(): ResolveFbClientResult;
  now(): string;
}

export interface FacebookPublishInput {
  caption?: string;
  /** Contextual affiliate link (tuỳ chọn) — có thì chèn vào description. */
  affiliateLink?: string;
  /** CTA text đi kèm link (tuỳ chọn). */
  contextualCta?: string;
  confirmRepost?: boolean;
}

// POSTING cũ hơn ngưỡng này coi là treo (cho retry, không khoá vĩnh viễn). PHẢI
// LỚN HƠN thời gian đăng thật tối đa (route maxDuration=600s; upload 180s + poll
// 240s + verify ≈ 450s) — nếu ngắn hơn, một publish còn-đang-chạy bị hiểu nhầm
// "treo" và request thứ 2 double-post (adversarial review Phần 82 F2). 15min > 10min.
const POSTING_STALE_MS = 15 * 60 * 1000;

/**
 * Dựng description Reel: caption → (CTA + link nếu có) → hashtags. Contextual
 * affiliate chèn ĐÚNG CHỖ (sau caption, trước hashtags). Không link → caption thường.
 */
export function buildFacebookDescription(
  caption: string,
  hashtags: string[],
  contextualCta?: string,
  affiliateLink?: string,
): string {
  const lines: string[] = [caption.trim()];
  const cta = (contextualCta ?? '').trim();
  const link = (affiliateLink ?? '').trim();
  if (cta) lines.push(cta);
  if (link) lines.push(`👉 ${link}`);
  const tags = (hashtags ?? []).filter((h) => h.startsWith('#')).join(' ');
  if (tags) lines.push(tags);
  return lines.filter(Boolean).join('\n');
}

/** Tính 4 đèn readiness từ view + cờ env. Pure, không IO. */
export function computeFacebookReadiness(
  view: FacebookPublishJobView,
  facebookApiReady: boolean,
): EntFacebookReadiness {
  const videoApproved = view.previewApproved === true;
  const hasFinalVideo = !!view.finalVideoAbsPath;
  const hasCaption = (view.caption ?? '').trim().length > 0;
  const notPosted = view.facebookStatus !== 'POSTED';
  const allReady = videoApproved && hasFinalVideo && hasCaption && facebookApiReady && notPosted;
  return { videoApproved, hasFinalVideo, hasCaption, facebookApiReady, notPosted, allReady };
}

/**
 * Orchestrate đăng Facebook. Chạy hết guard trước, chỉ gọi client khi mọi guard
 * pass. Ghi POSTING → POSTED/FAILED. KHÔNG fake success. Owner Shopee chỉ cảnh
 * báo mềm (ghi vào summary), KHÔNG chặn.
 */
export async function publishToFacebook(
  deps: FacebookPublishDeps,
  id: string,
  input: FacebookPublishInput = {},
): Promise<FacebookPublishOutcome> {
  const job = deps.loadJob(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };

  // GATE 2 — chỉ đăng video Operator đã duyệt.
  if (!job.previewApproved) {
    return { ok: false, code: 'NO_PREVIEW_GATE', message: 'Chưa duyệt video (GATE 2) — không đăng.' };
  }
  if (!job.finalVideoAbsPath) {
    return { ok: false, code: 'NO_FINAL', message: 'Chưa có video final đã duyệt.' };
  }

  const caption = (input.caption ?? job.caption ?? '').trim();
  const hashtags = job.hashtags ?? [];
  if (!caption) {
    return { ok: false, code: 'NO_CAPTION', message: 'Caption rỗng — bấm "Tạo caption" trước khi đăng.' };
  }

  // Đã đăng → cần confirmRepost rõ ràng.
  if (job.facebookStatus === 'POSTED' && !input.confirmRepost) {
    return {
      ok: false,
      code: 'ALREADY_POSTED',
      message: 'Job đã đăng Facebook. Cần xác nhận đăng lại (confirmRepost).',
    };
  }

  // Publish khác đang chạy (POSTING chưa treo) → bận.
  if (job.facebookStatus === 'POSTING') {
    const ageMs = job.facebookStartedAt
      ? Date.now() - new Date(job.facebookStartedAt).getTime()
      : 0;
    const stale = !job.facebookStartedAt || ageMs > POSTING_STALE_MS;
    if (!stale) {
      return { ok: false, code: 'PUBLISH_BUSY', message: 'Đang đăng job này — chờ xong.' };
    }
  }

  // Pipeline (render/produce) đang chạy → không đăng chen.
  if (job.pipelineBusyReason) {
    return { ok: false, code: 'BUSY', message: job.pipelineBusyReason };
  }

  // Contextual affiliate — soft-check owner (KHÔNG chặn), ghi vào summary.
  const affiliateLink = (input.affiliateLink ?? '').trim() || null;
  const contextualCta = (input.contextualCta ?? '').trim() || null;
  const ownerCheck = checkAffiliateLinkOwner(affiliateLink);
  const affiliateOwnerWarning =
    ownerCheck.status === 'mismatch' || ownerCheck.status === 'unverified'
      ? ownerCheck.message
      : null;

  const resolved = deps.resolveClient();
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  const { client, mode } = resolved;

  const description = buildFacebookDescription(
    caption,
    hashtags,
    contextualCta ?? undefined,
    affiliateLink ?? undefined,
  );

  // Lưu caption cuối (đã sửa) vào package trước khi đăng — proof.
  deps.saveCaption(id, caption, hashtags);

  const startedAt = deps.now();
  const base: EntFacebookPublishSummary = {
    status: 'POSTING',
    mode,
    captionUsed: caption,
    descriptionUsed: description,
    affiliateLinkUsed: affiliateLink,
    contextualCtaUsed: contextualCta,
    affiliateOwnerStatus: ownerCheck.status,
    affiliateOwnerWarning,
    startedAt,
    error: null,
  };
  deps.setStatus(id, base);

  const result = await client.publishReel({ videoPath: job.finalVideoAbsPath, description });

  if (result.ok) {
    const summary: EntFacebookPublishSummary = {
      ...base,
      status: 'POSTED',
      videoId: result.videoId,
      permalinkUrl: result.permalinkUrl,
      publishVisibility: result.publishVisibility ?? 'UNCONFIRMED',
      postedAt: deps.now(),
      error: null,
    };
    deps.setStatus(id, summary);
    return { ok: true, summary };
  }

  const summary: EntFacebookPublishSummary = {
    ...base,
    status: 'FAILED',
    videoId: result.videoId,
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
  };
  deps.setStatus(id, summary);
  return {
    ok: false,
    code: 'FACEBOOK_API_ERROR',
    message: result.error?.message ?? 'Đăng Facebook lỗi.',
    summary,
  };
}
