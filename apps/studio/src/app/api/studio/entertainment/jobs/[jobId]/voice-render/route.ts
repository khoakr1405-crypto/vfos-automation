/* =============================================================================
 * VFOS Studio — Entertainment VOICE+RENDER API (E-UI-4/5)
 * -----------------------------------------------------------------------------
 * POST: từ script ĐÃ DUYỆT chạy chuỗi render DETACHED = 12-voice-render (VO +
 * caption) + 15-audio-ambient-full (audio policy remove_speech_keep_ambient:
 * Demucs bỏ giọng Trung, GIỮ ambient biển/gió/nước). GATE 1 BẮT BUỘC —
 * startStep('render') từ chối nếu reviewGates.scriptApproved !== true. Dừng ở
 * preview (GATE 2). Local-only, single-flight. Không publish/TikTok API.
 * ========================================================================== */

import { isValidJobId, startStep } from '@/lib/entertainment/jobs';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const HTTP_FOR: Record<string, number> = {
  NOT_FOUND: 404,
  PREREQ: 409,
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
  const res = startStep(jobId, 'render');
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 202 });
}
