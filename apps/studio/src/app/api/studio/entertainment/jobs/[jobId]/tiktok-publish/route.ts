/* =============================================================================
 * VFOS Studio — Entertainment TikTok publish API (Phase 3)
 * -----------------------------------------------------------------------------
 * POST: đăng video đã duyệt lên TikTok (Content Posting API). Guard đầy đủ qua
 * publish.ts (pure/DI); deps thật từ jobs.ts. Local-only. KHÔNG auto-publish:
 * Operator bấm nút. KHÔNG log/return token. Live publish cần TIKTOK_PUBLISH_LIVE.
 * Round 1: mặc định mock (env mock) — không gọi live.
 * ========================================================================== */

import { buildPublishDeps, isValidJobId } from '@/lib/entertainment/jobs';
import { type PublishErrorCode, publishToTikTok } from '@/lib/entertainment/publish';
import { isPublishHalted, tickKeyOk } from '@/lib/growth-data/publish-guard';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const HTTP_FOR: Record<PublishErrorCode, number> = {
  NOT_FOUND: 404,
  NO_CHANNEL_BINDING: 409,
  CHANNEL_UNKNOWN: 409,
  CHANNEL_MISMATCH: 409,
  CROSS_POST_DENIED: 409,
  ACCOUNT_INACTIVE: 409,
  ACCOUNT_IDENTITY_MISMATCH: 409,
  TOPIC_NOT_ALLOWED: 409,
  NO_PREVIEW_GATE: 409,
  NO_FINAL: 409,
  NO_CAPTION: 409,
  ALREADY_POSTED: 409,
  PUBLISH_BUSY: 409,
  BUSY: 409,
  TIKTOK_DISABLED: 409,
  TIKTOK_NOT_CONFIGURED: 409,
  LIVE_NOT_ENABLED: 409,
  TIKTOK_AUTH_EXPIRED: 409,
  TIKTOK_API_ERROR: 502,
};

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  // Phanh tổng chặn CẢ route (R-F) — emergency-freeze phải đóng MỌI cửa đăng.
  if (isPublishHalted()) {
    return Response.json({ ok: false, code: 'PUBLISH_HALTED' }, { status: 423 });
  }
  if (!tickKeyOk(req)) {
    return Response.json({ ok: false, code: 'TICK_KEY_REQUIRED' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    caption?: unknown;
    confirmRepost?: unknown;
    selectedChannelId?: unknown;
  };
  const caption = typeof body.caption === 'string' ? body.caption : undefined;
  const confirmRepost = body.confirmRepost === true;
  const selectedChannelId =
    typeof body.selectedChannelId === 'string' ? body.selectedChannelId : undefined;

  const res = await publishToTikTok(buildPublishDeps(), jobId, {
    caption,
    confirmRepost,
    selectedChannelId,
  });
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 200 });
}
