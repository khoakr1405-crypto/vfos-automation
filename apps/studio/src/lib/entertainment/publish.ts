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
  /** Account TikTok ĐÃ đăng (bind của job) — proof đăng đúng kênh. */
  accountId?: string;
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
  // ── Multi-channel binding guards (chống đăng nhầm kênh) ──
  | 'NO_CHANNEL_BINDING'
  | 'CHANNEL_UNKNOWN'
  | 'CHANNEL_MISMATCH'
  | 'CROSS_POST_DENIED'
  | 'ACCOUNT_INACTIVE'
  | 'ACCOUNT_IDENTITY_MISMATCH'
  | 'TOPIC_NOT_ALLOWED'
  // ── Content / state gates ──
  | 'NO_PREVIEW_GATE'
  | 'NO_FINAL'
  | 'NO_CAPTION'
  | 'ALREADY_POSTED'
  | 'PUBLISH_BUSY'
  | 'BUSY'
  // ── Account / API ──
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
  /** Kênh bind của job (immutable, ghi lúc tạo). null = job chưa bind. */
  channelId: string | null;
  /** Account TikTok đích bind của job (immutable). null = chưa bind. */
  accountId: string | null;
  /** Niche nội dung của job (đối chiếu allowedContentTypes). */
  niche?: string | null;
  previewApproved: boolean;
  finalVideoAbsPath: string | null;
  caption: string;
  hashtags: string[];
  tiktokStatus?: 'POSTING' | 'POSTED' | 'FAILED' | null;
  tiktokStartedAt?: string | null;
  /** Lý do pipeline đang bận (render/produce…) nếu có — chặn publish. */
  pipelineBusyReason?: string | null;
}

/** View kênh (từ registry) mà guard cần — KHÔNG token/secret. */
export interface PublishChannelView {
  channelId: string;
  accountId: string;
  niche: string;
  tiktokUsername: string;
  status: 'active' | 'inactive';
  allowedContentTypes: string[];
  topicMismatchPolicy: 'block' | 'warn';
}

export type ResolveClientResult =
  | { ok: true; client: TikTokPublishClient; mode: TikTokPublishMode }
  | {
      ok: false;
      code: 'TIKTOK_DISABLED' | 'TIKTOK_NOT_CONFIGURED' | 'LIVE_NOT_ENABLED' | 'TIKTOK_AUTH_EXPIRED';
      message: string;
    };

export interface PublishDeps {
  loadJob(id: string): PublishJobView | null;
  /** Lấy kênh theo channelId (registry) — null nếu không có kênh. */
  loadChannel(channelId: string): PublishChannelView | null;
  /** Ghi caption (đã sửa) vào package trước khi đăng — proof caption cuối. */
  saveCaption(id: string, caption: string, hashtags: string[]): void;
  /** Ghi tiktok summary + state vào manifest. */
  setStatus(id: string, summary: EntTikTokPublishSummary): void;
  /** Resolve client THEO accountId của job (G4) — KHÔNG trả token, KHÔNG theo UI. */
  resolveClientForAccount(accountId: string): ResolveClientResult;
  /** G7 — token đang cầm có đúng là của account này không (đối chiếu username registry). */
  verifyAccountIdentity(
    accountId: string,
    expectedUsername: string,
  ): Promise<{ ok: boolean; reason?: string }>;
  now(): string;
}

export interface PublishInput {
  caption?: string;
  confirmRepost?: boolean;
  /** Kênh đang chọn trên UI (G3) — phải khớp job.channelId mới cho đăng. */
  selectedChannelId?: string;
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

  // ── Multi-channel binding guards (chống đăng nhầm kênh, default-deny) ──
  // G1 — job phải có kênh bind (immutable từ lúc tạo).
  if (!job.channelId) {
    return {
      ok: false,
      code: 'NO_CHANNEL_BINDING',
      message: 'Job chưa gắn kênh — không xác định được tài khoản đích.',
    };
  }
  // G2 — kênh phải tồn tại trong registry.
  const channel = deps.loadChannel(job.channelId);
  if (!channel) {
    return {
      ok: false,
      code: 'CHANNEL_UNKNOWN',
      message: `Kênh "${job.channelId}" không có trong registry.`,
    };
  }
  // Cross-post / drift — account bind của job PHẢI khớp account của kênh.
  if (!job.accountId || job.accountId !== channel.accountId) {
    return {
      ok: false,
      code: 'CROSS_POST_DENIED',
      message:
        'Account bind của job không khớp account của kênh — chặn đăng (không cross-post tự động).',
    };
  }
  const accountId = channel.accountId;
  // G3 — kênh đang chọn trên UI (nếu có) phải khớp kênh của job.
  if (input.selectedChannelId && input.selectedChannelId !== job.channelId) {
    return {
      ok: false,
      code: 'CHANNEL_MISMATCH',
      message: `Job thuộc kênh "${job.channelId}" — không khớp kênh đang chọn "${input.selectedChannelId}".`,
    };
  }

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

  // G5 — kênh/account phải đang active.
  if (channel.status !== 'active') {
    return {
      ok: false,
      code: 'ACCOUNT_INACTIVE',
      message: `Kênh "${channel.channelId}" (account ${accountId}) đang inactive — không đăng.`,
    };
  }
  // G8 — niche job phải nằm trong allowedContentTypes (chặn theo policy "block").
  if (
    channel.topicMismatchPolicy === 'block' &&
    channel.allowedContentTypes.length > 0 &&
    job.niche != null &&
    !channel.allowedContentTypes.includes(job.niche)
  ) {
    return {
      ok: false,
      code: 'TOPIC_NOT_ALLOWED',
      message: `Niche "${job.niche}" không thuộc nội dung cho phép của kênh "${channel.channelId}".`,
    };
  }

  // G4 — Resolve client THEO accountId BIND CỦA JOB (server-side, KHÔNG theo UI).
  const resolved = deps.resolveClientForAccount(accountId);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  const { client, mode } = resolved;

  // G7 — token đang cầm phải đúng là của account kênh (đối chiếu username registry).
  const identity = await deps.verifyAccountIdentity(accountId, channel.tiktokUsername);
  if (!identity.ok) {
    return {
      ok: false,
      code: 'ACCOUNT_IDENTITY_MISMATCH',
      message: `Token không khớp tài khoản kênh @${channel.tiktokUsername}${identity.reason ? ` (${identity.reason})` : ''} — chặn đăng.`,
    };
  }

  // Lưu caption cuối (đã sửa) vào package trước khi đăng — proof.
  deps.saveCaption(id, caption, hashtags);

  const startedAt = deps.now();
  deps.setStatus(id, {
    status: 'POSTING',
    mode,
    accountId,
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
      accountId,
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
    accountId,
    publishId: result.publishId,
    captionUsed: caption,
    hashtagsUsed: hashtags,
    startedAt,
    error: err.raw,
  };
  deps.setStatus(id, summary);
  return { ok: false, code: err.code, message: err.message, summary };
}
