/* =============================================================================
 * VFOS Studio — Entertainment PACKAGE API (E-UI-6)
 * -----------------------------------------------------------------------------
 * POST: đóng gói cho đăng TAY (16-package) — final mp4 + caption + hashtag +
 * checklist. Yêu cầu GATE 2 (previewApproved). KHÔNG auto-publish, KHÔNG TikTok
 * API, KHÔNG affiliate. Local-only, sync (1 call caption).
 * ========================================================================== */

import { isValidJobId, runPackage } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const HTTP_FOR: Record<string, number> = {
  NOT_FOUND: 404,
  NO_PREVIEW_GATE: 409,
  NO_FINAL: 409,
  AUDIO_NOT_APPLIED: 409,
  BUSY: 409,
  PACKAGE_FAILED: 500,
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
  const res = runPackage(jobId);
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 200 });
}
