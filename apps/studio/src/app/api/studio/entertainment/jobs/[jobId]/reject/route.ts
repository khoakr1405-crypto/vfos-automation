/* =============================================================================
 * VFOS Studio — Entertainment GATE 2 (preview reject) API (E-UI-4)
 * -----------------------------------------------------------------------------
 * POST: bỏ duyệt preview → previewApproved=false, quay lại PREVIEW_PENDING để
 * Operator sửa script/re-render. Local-only.
 * ========================================================================== */

import { isValidJobId, rejectPreview } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ ok: false, code: 'BAD_JOB_ID' }, { status: 400 });
  }
  const res = rejectPreview(jobId);
  if (!res.ok) {
    return Response.json(res, { status: res.code === 'NOT_FOUND' ? 404 : 400 });
  }
  return Response.json(res, { status: 200 });
}
