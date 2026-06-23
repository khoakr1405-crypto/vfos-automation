/* =============================================================================
 * VFOS Studio — Entertainment lane job detail API (E-UI-2 → E-UI-3)
 * -----------------------------------------------------------------------------
 * GET: trạng thái 1 job giải trí (manifest + live step status + script summary +
 * gate, reconcile state machine). Local-only, jobId validated.
 * ========================================================================== */

import { getJobDetail, isValidJobId } from '@/lib/entertainment/jobs';

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
  const job = getJobDetail(jobId);
  if (!job) {
    return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  }
  return Response.json({ ok: true, job });
}
