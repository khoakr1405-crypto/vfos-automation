/* =============================================================================
 * VFOS Studio — Entertainment GATE 2 (preview approve) API (E-UI-4)
 * -----------------------------------------------------------------------------
 * POST: Operator duyệt preview → reviewGates.previewApproved + state APPROVED.
 * READY ≠ được đăng. KHÔNG auto-publish (đăng tay là phase riêng). Local-only.
 * ========================================================================== */

import { approvePreview, isValidJobId } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const HTTP_FOR: Record<string, number> = {
  NOT_FOUND: 404,
  NO_SCRIPT_GATE: 409,
  NO_PREVIEW: 409,
  AUDIO_NOT_APPLIED: 409,
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
  const res = approvePreview(jobId);
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 200 });
}
