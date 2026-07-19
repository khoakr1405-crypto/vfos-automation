/* =============================================================================
 * VFOS Studio — Review lane → TikTok publish (video-only, NO affiliate) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * ĐỔI TARGET lane Review Sản phẩm: từ Facebook (publisher CŨ giữ nguyên để
 * rollback — KHÔNG đụng job-facebook-publish-command.ts / publish-facebook route)
 * sang TikTok "video thuần". Vòng này:
 *   - KHÔNG affiliate tự động, KHÔNG TikTok Shop, KHÔNG Product Card gate.
 *   - Caption do Operator gõ tay (không đọc caption.txt affiliate cũ).
 *   - Mặc định MOCK (TIKTOK_MODE=mock) — không gọi live. Live cần bật env riêng.
 *
 * REUSE (lane-agnostic, KHÔNG kéo lane Giải trí sang): tiktok-publish-client +
 * account-store. Trạng thái đăng ghi ra file RIÊNG data/temp/jobs/<id>/
 * tiktok_publish_status.json — KHÔNG đụng job_manifest.json / registry nên
 * KHÔNG ảnh hưởng analytics/history Facebook Round 1.
 *
 * No-Go: publish là cổng tay (Operator bấm), KHÔNG auto-publish; không fake
 * success (mock đánh dấu mode='mock'); lỗi sanitize, KHÔNG lộ token.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getJobPreviewAbsPath, loadJobById } from '@/lib/studio-data/jobs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { getAccountTokens, isAccountTokenExpired } from '@/lib/tiktok/account-store';
import {
  type TikTokPublishClient,
  type TikTokPublishMode,
  createMockTikTokPublishClient,
  createTikTokPublishClient,
  queryCreatorUsername,
} from '@/lib/tiktok/tiktok-publish-client';

/** Account TikTok đích của lane Review (Operator cấu hình token ở OP-2). */
const REVIEW_TIKTOK_ACCOUNT_ID = (process.env.REVIEW_TIKTOK_ACCOUNT_ID || 'tt_review_main').trim();
const STATUS_REL = (id: string) => `data/temp/jobs/${id}/tiktok_publish_status.json`;

export type ReviewPublishErrorCode =
  | 'NOT_FOUND'
  | 'NOT_APPROVED'
  | 'NO_FINAL'
  | 'NO_CAPTION'
  | 'ALREADY_POSTED'
  | 'PUBLISH_BUSY'
  | 'TIKTOK_DISABLED'
  | 'TIKTOK_NOT_CONFIGURED'
  | 'LIVE_NOT_ENABLED'
  | 'TIKTOK_AUTH_EXPIRED'
  | 'ACCOUNT_IDENTITY_MISMATCH'
  | 'TIKTOK_API_ERROR';

// POSTING cũ hơn ngưỡng này coi là treo (cho retry). PHẢI lớn hơn thời gian đăng
// TikTok tối đa (upload 120s + poll 20×3s ≈ 3min) để một publish đang chạy KHÔNG bị
// hiểu nhầm "treo" → chống double-post khi tick + bấm tay trùng nhau (Phần 82 F1).
const POSTING_STALE_MS = 15 * 60 * 1000;

/** Tóm tắt đăng TikTok của job Review (file riêng, KHÔNG token). */
export interface ReviewTikTokStatus {
  status: 'POSTING' | 'POSTED' | 'FAILED';
  mode: TikTokPublishMode;
  accountId: string;
  publishId?: string;
  postId?: string;
  shareUrl?: string;
  captionUsed: string;
  startedAt?: string;
  postedAt?: string;
  error?: { code: string; message: string } | null;
}

/** 4 đèn readiness cho UI (không token/secret). Caption do client tự gate. */
export interface ReviewTikTokReadiness {
  videoApproved: boolean;
  hasFinalVideo: boolean;
  tiktokApiReady: boolean;
  notPosted: boolean;
}

export type ReviewPublishOutcome =
  | { ok: true; status: ReviewTikTokStatus }
  | { ok: false; code: ReviewPublishErrorCode; message: string; status?: ReviewTikTokStatus };

type ResolveClientResult =
  | { ok: true; client: TikTokPublishClient; mode: TikTokPublishMode }
  | {
      ok: false;
      code:
        | 'TIKTOK_DISABLED'
        | 'TIKTOK_NOT_CONFIGURED'
        | 'LIVE_NOT_ENABLED'
        | 'TIKTOK_AUTH_EXPIRED';
      message: string;
    };

function nowIso(): string {
  return new Date().toISOString();
}

function parseMode(): 'disabled' | 'mock' | 'display' | 'business' {
  const m = (process.env.TIKTOK_MODE ?? 'mock').trim().toLowerCase();
  if (m === 'disabled') return 'disabled';
  if (m === 'display') return 'display';
  if (m === 'business') return 'business';
  return 'mock';
}

/** Resolve client cho account Review (mock trước, live cần token + bật cờ). */
function resolveReviewClient(): ResolveClientResult {
  const mode = parseMode();
  if (mode === 'disabled') {
    return {
      ok: false,
      code: 'TIKTOK_DISABLED',
      message: 'TikTok đang tắt (TIKTOK_MODE=disabled).',
    };
  }
  if (mode === 'mock') {
    return { ok: true, client: createMockTikTokPublishClient(), mode: 'mock' };
  }
  const clientKey = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  const tokens = getAccountTokens(REVIEW_TIKTOK_ACCOUNT_ID);
  if (!clientKey || !tokens?.accessToken) {
    const missing = [
      !clientKey ? 'TIKTOK_CLIENT_KEY' : null,
      !tokens?.accessToken ? `token account ${REVIEW_TIKTOK_ACCOUNT_ID}` : null,
    ].filter(Boolean);
    return {
      ok: false,
      code: 'TIKTOK_NOT_CONFIGURED',
      message: `Thiếu cấu hình TikTok cho lane Review: ${missing.join(', ')}.`,
    };
  }
  if (isAccountTokenExpired(REVIEW_TIKTOK_ACCOUNT_ID)) {
    return {
      ok: false,
      code: 'TIKTOK_AUTH_EXPIRED',
      message: `Token account ${REVIEW_TIKTOK_ACCOUNT_ID} đã hết hạn — refresh trước khi đăng.`,
    };
  }
  if ((process.env.TIKTOK_PUBLISH_LIVE || '').trim().toLowerCase() !== 'true') {
    return {
      ok: false,
      code: 'LIVE_NOT_ENABLED',
      message: 'Đăng TikTok thật chưa được bật (đặt TIKTOK_PUBLISH_LIVE=true).',
    };
  }
  return {
    ok: true,
    client: createTikTokPublishClient({ accessToken: tokens.accessToken, mode }),
    mode,
  };
}

function readStatus(id: string): ReviewTikTokStatus | null {
  const abs = resolveInsideRepo(STATUS_REL(id));
  if (!abs || !existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as ReviewTikTokStatus;
  } catch {
    return null;
  }
}

function writeStatus(id: string, status: ReviewTikTokStatus): void {
  const abs = resolveInsideRepo(STATUS_REL(id));
  if (!abs) return;
  try {
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, JSON.stringify(status, null, 2));
  } catch {
    /* trace là phụ — không chặn flow */
  }
}

/** Job Review đã được Operator duyệt video? (operatorDecision === APPROVED). */
function isJobApproved(jobId: string): boolean {
  const job = loadJobById(jobId);
  return job?.operatorDecision === 'APPROVED';
}

/** 4 đèn readiness cho UI card "Đăng lên TikTok" của lane Review. */
export function getReviewTikTokReadiness(jobId: string): ReviewTikTokReadiness | null {
  const job = loadJobById(jobId);
  if (!job) return null;
  const status = readStatus(jobId);
  return {
    videoApproved: job.operatorDecision === 'APPROVED',
    hasFinalVideo: getJobPreviewAbsPath(jobId) !== null,
    tiktokApiReady: resolveReviewClient().ok,
    notPosted: status?.status !== 'POSTED',
  };
}

/** Đọc trạng thái đăng hiện tại (cho UI — KHÔNG token). */
export function getReviewTikTokStatus(jobId: string): ReviewTikTokStatus | null {
  return readStatus(jobId);
}

/**
 * Phần 79 — "Đóng gói" caption cho video thuần: đọc draft GPT đã sinh sẵn trong
 * script_artifact.json (captionDraft + hashtags; fallback hook). Chỉ là GỢI Ý
 * prefill — Operator sửa tay thoải mái, cổng đăng vẫn là tay (No-Go #3).
 * KHÔNG chèn link/affiliate (video thuần đúng swap Phần 66).
 */
export function getReviewCaptionDraft(jobId: string): string | null {
  const abs = resolveInsideRepo(`data/temp/jobs/${jobId}/script_artifact.json`);
  if (!abs || !existsSync(abs)) return null;
  try {
    const art = JSON.parse(readFileSync(abs, 'utf8')) as {
      captionDraft?: unknown;
      hashtags?: unknown;
      hook?: unknown;
    };
    const draft = typeof art.captionDraft === 'string' ? art.captionDraft.trim() : '';
    const hook = typeof art.hook === 'string' ? art.hook.trim() : '';
    const base = draft || hook;
    if (!base) return null;
    const tags = Array.isArray(art.hashtags)
      ? art.hashtags.filter((t): t is string => typeof t === 'string' && t.startsWith('#'))
      : [];
    const missingTags = tags.filter((t) => !base.includes(t));
    return [base, missingTags.join(' ')].filter(Boolean).join('\n').trim().slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * Đăng video Review lên TikTok (video thuần). Chạy hết guard trước, chỉ gọi
 * client khi mọi guard pass. Ghi POSTING → POSTED/FAILED ra file riêng.
 */
export async function publishReviewToTikTok(
  jobId: string,
  input: { caption?: string; confirmRepost?: boolean } = {},
): Promise<ReviewPublishOutcome> {
  const job = loadJobById(jobId);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };

  if (!isJobApproved(jobId)) {
    return {
      ok: false,
      code: 'NOT_APPROVED',
      message: 'Video chưa được Operator duyệt (operatorDecision phải APPROVED).',
    };
  }

  const videoPath = getJobPreviewAbsPath(jobId);
  if (!videoPath) {
    return { ok: false, code: 'NO_FINAL', message: 'Chưa có video final đã duyệt để đăng.' };
  }

  const caption = (input.caption ?? '').trim();
  if (!caption) {
    return {
      ok: false,
      code: 'NO_CAPTION',
      message: 'Caption rỗng — nhập caption trước khi đăng.',
    };
  }

  const prev = readStatus(jobId);
  if (prev?.status === 'POSTED' && !input.confirmRepost) {
    return {
      ok: false,
      code: 'ALREADY_POSTED',
      message: 'Job đã đăng TikTok. Cần xác nhận đăng lại (confirmRepost).',
    };
  }

  // Busy-lock: một publish khác đang chạy (POSTING chưa treo) → chặn, không đăng
  // chồng. Đóng cửa sổ double-post giữa lúc upload/poll (tick + bấm tay, hoặc 2
  // tick) — trước đây chỉ chặn POSTED nên lệnh thứ 2 lọt (Phần 82 F1).
  if (prev?.status === 'POSTING') {
    const ageMs = prev.startedAt ? Date.now() - new Date(prev.startedAt).getTime() : 0;
    const stale = !prev.startedAt || ageMs > POSTING_STALE_MS;
    if (!stale) {
      return { ok: false, code: 'PUBLISH_BUSY', message: 'Đang đăng job này — chờ xong.' };
    }
  }

  const resolved = resolveReviewClient();
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }
  const { client, mode } = resolved;

  // Identity verify (chỉ live + khi có username kỳ vọng) — chống dán nhầm token.
  const expectedUsername = (process.env.REVIEW_TIKTOK_USERNAME || '').trim();
  if (mode !== 'mock' && expectedUsername) {
    const tokens = getAccountTokens(REVIEW_TIKTOK_ACCOUNT_ID);
    const live: { ok: boolean; username?: string } = tokens?.accessToken
      ? await queryCreatorUsername(tokens.accessToken)
      : { ok: false };
    if (!live.ok || live.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
      return {
        ok: false,
        code: 'ACCOUNT_IDENTITY_MISMATCH',
        message: `Token không khớp tài khoản kỳ vọng @${expectedUsername} — chặn đăng.`,
      };
    }
  }

  const startedAt = nowIso();
  writeStatus(jobId, {
    status: 'POSTING',
    mode,
    accountId: REVIEW_TIKTOK_ACCOUNT_ID,
    captionUsed: caption,
    startedAt,
    error: null,
  });

  const result = await client.publishVideo({ videoPath, caption, hashtags: [] });

  if (result.ok) {
    const status: ReviewTikTokStatus = {
      status: 'POSTED',
      mode,
      accountId: REVIEW_TIKTOK_ACCOUNT_ID,
      publishId: result.publishId,
      postId: result.postId,
      shareUrl: result.shareUrl,
      captionUsed: caption,
      startedAt,
      postedAt: nowIso(),
      error: null,
    };
    writeStatus(jobId, status);
    return { ok: true, status };
  }

  const status: ReviewTikTokStatus = {
    status: 'FAILED',
    mode,
    accountId: REVIEW_TIKTOK_ACCOUNT_ID,
    publishId: result.publishId,
    captionUsed: caption,
    startedAt,
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
  };
  writeStatus(jobId, status);
  return {
    ok: false,
    code: 'TIKTOK_API_ERROR',
    message: result.error?.message ?? 'Đăng TikTok lỗi.',
    status,
  };
}
