/* =============================================================================
 * VFOS Studio — Entertainment lane GATE 1 (script approve) API (E-UI-3)
 * -----------------------------------------------------------------------------
 * POST: Operator duyệt nội dung script → set reviewGates.scriptApproved.
 * READY ≠ được đăng. Voice/render (E-UI-4) sẽ BỊ CHẶN tới khi gate này pass.
 * Local-only. Không auto qua gate, không publish.
 * ========================================================================== */

import { approveScript, isValidJobId } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const HTTP_FOR: Record<string, number> = {
  NOT_FOUND: 404,
  NO_SCRIPT: 409,
  BUSY: 409,
  BAD_STATE: 500,
};

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  const res = approveScript(jobId);
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 200 });
}
