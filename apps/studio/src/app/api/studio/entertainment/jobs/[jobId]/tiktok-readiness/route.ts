/* =============================================================================
 * VFOS Studio — Entertainment TikTok readiness API (Phase 3)
 * -----------------------------------------------------------------------------
 * GET: 5 đèn readiness cho card "Đăng lên TikTok" + caption preview + tiktok
 * summary (status/postId/shareUrl — KHÔNG token). Local-only, read-only.
 * ========================================================================== */

import { getJobDetail, getTikTokReadiness, isValidJobId } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  const readiness = getTikTokReadiness(jobId);
  if (!readiness) {
    return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  }
  const job = getJobDetail(jobId);
  return Response.json({
    ok: true,
    readiness,
    state: job?.state ?? null,
    caption: job?.package?.caption ?? '',
    hashtags: job?.package?.hashtags ?? [],
    tiktok: job?.tiktok ?? null,
  });
}
