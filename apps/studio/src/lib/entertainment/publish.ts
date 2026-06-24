/* =============================================================================
 * VFOS Studio — Entertainment TikTok publish orchestration (Phase 3)
 * -----------------------------------------------------------------------------
 * Guard + luồng đăng TikTok cho lane Giải trí. PURE (dependency-injection, KHÔNG
 * import alias @/) để node:test nạp + test guard trực tiếp bằng mock deps/client,
 * KHÔNG gọi live API. Route (app/api/.../tiktok-publish) wiring deps thật từ
 * jobs.ts. KHÔNG Shopee/affiliate/productBinding/Facebook.
 *
 * No-Go: publish là cổng tay (Operator bấm), KHÔNG auto-publish; không fake
 * success; lỗi sanitize, không lộ token.
 * ========================================================================== */

import type {
  TikTokPublishClient,
  TikTokPublishError,
  TikTokPublishMode,
} from '../tiktok/tiktok-publish-client';

export type { TikTokPublishMode } from '../tiktok/tiktok-publish-client';

/** Tóm tắt đăng TikTok lưu vào manifest (ent_job.json.tiktok). KHÔNG có token. */
export interface EntTikTokPublishSummary {
  status: 'POSTING' | 'POSTED' | 'FAILED';
  mode: TikTokPublishMode;
  publishId?: string;
  postId?: string;
  shareUrl?: string;
  captionUsed: string;
  hashtagsUsed: string[];
  startedAt?: string;
  postedAt?: string;
  error?: { code: string; message: string } | null;
}

/** 5 đèn readiness cho UI (không token/secret). */
export interface EntTikTokReadiness {
  videoApproved: boolean;
  hasFinalVideo: boolean;
  hasCaption: boolean;
  tiktokApiReady: boolean;
  notPosted: boolean;
  allReady: boolean;
}

export type PublishErrorCode =
  | 'NOT_FOUND'
  | 'NO_PREVIEW_GATE'
  | 'NO_FINAL'
  | 'NO_CAPTION'
  | 'ALREADY_POSTED'
  | 'PUBLISH_BUSY'
  | 'BUSY'
  | 'TIKTOK_DISABLED'
  | 'TIKTOK_NOT_CONFIGURED'
  | 'LIVE_NOT_ENABLED'
  | 'TIKTOK_API_ERROR'
  | 'TIKTOK_AUTH_EXPIRED';

export type PublishOutcome =
  | { ok: true; summary: EntTikTokPublishSummary }
  | { ok: false; code: PublishErrorCode; message: string; summary?: EntTikTokPublishSummary };

/** View tối giản của job mà publish cần (deps build từ manifest thật). */
export interface PublishJobView {
  jobId: string;
  state: string;
  previewApproved: boolean;
  finalVideoAbsPath: string | null;
  caption: string;
  hashtags: string[];
  tiktokStatus?: 'POSTING' | 'POSTED' | 'FAILED' | null;
  tiktokStartedAt?: string | null;
  /** Lý do pipeline đang bận (render/produce…) nếu có — chặn publish. */
  pipelineBusyReason?: string | null;
}

export type ResolveClientResult =
  | { ok: true; client: TikTokPublishClient; mode: TikTokPublishMode }
  | {
      ok: false;
      code: 'TIKTOK_DISABLED' | 'TIKTOK_NOT_CONFIGURED' | 'LIVE_NOT_ENABLED';
      message: string;
    };

export interface PublishDeps {
  loadJob(id: string): PublishJobView | null;
  /** Ghi caption (đã sửa) vào package trước khi đăng — proof caption cuối. */
  saveCaption(id: string, caption: string, hashtags: string[]): void;
  /** Ghi tiktok summary + state vào manifest. */
  setStatus(id: string, summary: EntTikTokPublishSummary): void;
  /** Resolve client theo env (mock|live) — KHÔNG trả token. */
  resolveClient(): ResolveClientResult;
  now(): string;
}

export interface PublishInput {
  caption?: string;
  confirmRepost?: boolean;
}

/** POSTING cũ hơn ngưỡng này coi là treo (cho retry, không khoá vĩnh viễn). */
const POSTING_STALE_MS = 5 * 60 * 1000;

/** Sanitize lỗi client → {code,message}, ánh xạ auth_expired riêng. */
function toPublishError(err?: TikTokPublishError): {
  code: PublishErrorCode;
  message: string;
  raw: { code: string; message: string };
} {
  const code = err?.code ?? 'unknown';
  const message = err?.message ?? 'Lỗi không xác định từ TikTok API.';
  const mapped: PublishErrorCode =
    code === 'auth_expired' ? 'TIKTOK_AUTH_EXPIRED' : 'TIKTOK_API_ERROR';
  return { code: mapped, message, raw: { code, message } };
}

/**
 * Tính 5 đèn readiness từ view + cờ env. Pure, không IO.
 */
export function computeReadiness(
  view: PublishJobView,
  tiktokApiReady: boolean,
): EntTikTokReadiness {
  const videoApproved = view.previewApproved === true;
  const hasFinalVideo = !!view.finalVideoAbsPath;
  const hasCaption = (view.caption ?? '').trim().length > 0;
  const notPosted = view.tiktokStatus !== 'POSTED';
  const allReady = videoApproved && hasFinalVideo && hasCaption && tiktokApiReady && notPosted;
  return { videoApproved, hasFinalVideo, hasCaption, tiktokApiReady, notPosted, allReady };
}

/**
 * Orchestrate đăng TikTok. Chạy hết guard trước, chỉ gọi client khi mọi guard
 * pass. Ghi POSTING → POSTED/FAILED. KHÔNG fake success (client lỗi ⇒ FAILED).
 */
export async function publishToTikTok(
  deps: PublishDeps,
  id: string,
  input: PublishInput = {},
): Promise<PublishOutcome> {
  const job = deps.loadJob(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };

  // GATE 2 — chỉ đăng video Operator đã duyệt.
  if (!job.previewApproved) {
    return {
      ok: false,
      code: 'NO_PREVIEW_GATE',
      message: 'Chưa duyệt video (GATE 2) — không đăng.',
    };
  }
  if (!job.finalVideoAbsPath) {
    return { ok: false, code: 'NO_FINAL', message: 'Chưa có video final đã duyệt.' };
  }

  const caption = (input.caption ?? job.caption ?? '').trim();
  const hashtags = job.hashtags ?? [];
  if (!caption) {
    return {
      ok: false,
      code: 'NO_CAPTION',
      message: 'Caption rỗng — bấm "Tạo caption" trước khi đăng.',
    };
  }

  // Đã đăng → cần confirmRepost rõ ràng.
  if (job.tiktokStatus === 'POSTED' && !input.confirmRepost) {
    return {
      ok: false,
      code: 'ALREADY_POSTED',
      message: 'Job đã đăng TikTok. Cần xác nhận đăng lại (confirmRepost).',
    };
  }

  // Publish khác đang chạy (POSTING chưa treo) → bận.
  if (job.tiktokStatus === 'POSTING') {
    const ageMs = job.tiktokStartedAt ? Date.now() - new Date(job.tiktokStartedAt).getTime() : 0;
    const stale = !job.tiktokStartedAt || ageMs > POSTING_STALE_MS;
    if (!stale) {
      return { ok: false, code: 'PUBLISH_BUSY', message: 'Đang đăng job này — chờ xong.' };
    }
  }

  // Pipeline (render/produce) đang chạy → không đăng chen.
  if (job.pipelineBusyReason) {
    return { ok: false, code: 'BUSY', message: job.pipelineBusyReason };
  }

  // Resolve client (mock|live). Env thiếu / live chưa bật → chặn rõ.
  const resolved = deps.resolveClient();
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  const { client, mode } = resolved;

  // Lưu caption cuối (đã sửa) vào package trước khi đăng — proof.
  deps.saveCaption(id, caption, hashtags);

  const startedAt = deps.now();
  deps.setStatus(id, {
    status: 'POSTING',
    mode,
    captionUsed: caption,
    hashtagsUsed: hashtags,
    startedAt,
    error: null,
  });

  const result = await client.publishVideo({ videoPath: job.finalVideoAbsPath, caption, hashtags });

  if (result.ok) {
    const summary: EntTikTokPublishSummary = {
      status: 'POSTED',
      mode,
      publishId: result.publishId,
      postId: result.postId,
      shareUrl: result.shareUrl,
      captionUsed: caption,
      hashtagsUsed: hashtags,
      startedAt,
      postedAt: deps.now(),
      error: null,
    };
    deps.setStatus(id, summary);
    return { ok: true, summary };
  }

  const err = toPublishError(result.error);
  const summary: EntTikTokPublishSummary = {
    status: 'FAILED',
    mode,
    publishId: result.publishId,
    captionUsed: caption,
    hashtagsUsed: hashtags,
    startedAt,
    error: err.raw,
  };
  deps.setStatus(id, summary);
  return { ok: false, code: err.code, message: err.message, summary };
}
