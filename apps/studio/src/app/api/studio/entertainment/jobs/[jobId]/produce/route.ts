/* =============================================================================
 * VFOS Studio — Entertainment lane PRODUCE API (E-UI-3)
 * -----------------------------------------------------------------------------
 * POST: khởi chạy chuỗi sản xuất tới GATE 1 (analyze → montage → script) DETACHED
 * qua 20-pipeline.ts. Dừng TRƯỚC voice/render — chờ Operator duyệt script.
 * Local-only. Single-flight per job. Không publish, không TikTok API.
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
  const res = startStep(jobId, 'produce');
  if (!res.ok) {
    return Response.json(res, { status: HTTP_FOR[res.code] ?? 400 });
  }
  return Response.json(res, { status: 202 });
}
