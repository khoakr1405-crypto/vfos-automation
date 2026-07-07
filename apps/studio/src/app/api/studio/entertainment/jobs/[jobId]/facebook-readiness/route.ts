/* =============================================================================
 * VFOS Studio — Entertainment lane → Facebook readiness API
 * -----------------------------------------------------------------------------
 * GET: 4 đèn readiness cho card "Đăng lên Facebook" + caption preview + facebook
 * summary (status/videoId/permalink — KHÔNG token). Local-only, read-only.
 * ========================================================================== */

import { getFacebookReadiness, getJobDetail, isValidJobId } from '@/lib/entertainment/jobs';

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
  const readiness = getFacebookReadiness(jobId);
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
    facebook: job?.facebook ?? null,
  });
}
