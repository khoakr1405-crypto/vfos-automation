/* =============================================================================
 * VFOS Studio — Review lane → TikTok publish API (video-only, NO affiliate)
 * -----------------------------------------------------------------------------
 * POST: đăng video Review đã duyệt lên TikTok (Content Posting API), caption do
 *   Operator gõ tay. Guard qua review-tiktok/publish.ts. Local-only. KHÔNG
 *   auto-publish. Mặc định MOCK — live cần TIKTOK_MODE + TIKTOK_PUBLISH_LIVE.
 * GET: 4 đèn readiness + trạng thái đăng (KHÔNG token).
 * KHÔNG đụng publisher Facebook cũ (publish-facebook route giữ nguyên rollback).
 * ========================================================================== */

import {
  type ReviewPublishErrorCode,
  getReviewCaptionDraft,
  getReviewTikTokReadiness,
  getReviewTikTokStatus,
  publishReviewToTikTok,
} from '@/lib/review-tiktok/publish';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

function isValidJobId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

const HTTP_FOR: Record<ReviewPublishErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_APPROVED: 409,
  NO_FINAL: 409,
  NO_CAPTION: 409,
  ALREADY_POSTED: 409,
  TIKTOK_DISABLED: 409,
  TIKTOK_NOT_CONFIGURED: 409,
  LIVE_NOT_ENABLED: 409,
  TIKTOK_AUTH_EXPIRED: 409,
  ACCOUNT_IDENTITY_MISMATCH: 409,
  TIKTOK_API_ERROR: 502,
};

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  const readiness = getReviewTikTokReadiness(jobId);
  if (!readiness) {
    return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  }
  return Response.json({
    ok: true,
    readiness,
    tiktok: getReviewTikTokStatus(jobId),
    // Phần 79 — caption gợi ý từ script_artifact (GPT sinh sẵn; UI prefill khi rỗng).
    captionDraft: getReviewCaptionDraft(jobId),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    caption?: unknown;
    confirmRepost?: unknown;
  };
  const caption = typeof body.caption === 'string' ? body.caption : undefined;
  const confirmRepost = body.confirmRepost === true;

  const res = await publishReviewToTikTok(jobId, { caption, confirmRepost });
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 200 });
}
