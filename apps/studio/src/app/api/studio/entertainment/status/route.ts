/* =============================================================================
 * VFOS Studio — Entertainment lane STATUS API (PR-B) — READ-ONLY GET
 * -----------------------------------------------------------------------------
 * GET: liệt kê trạng thái job Entertainment cho panel Tổng quan (thay /ent-status).
 * Chỉ ĐỌC manifest qua listEntStatusForUi() (pure read). KHÔNG POST, KHÔNG mutate,
 * KHÔNG chạy pipeline/render/publish. Local-only, tách namespace, không đụng /jobs.
 * ========================================================================== */

import { listEntStatusForUi } from '@/lib/entertainment/status';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  return Response.json({ ok: true, jobs: listEntStatusForUi() });
}
