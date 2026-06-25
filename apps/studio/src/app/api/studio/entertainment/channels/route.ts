/* =============================================================================
 * VFOS Studio — Entertainment channels API (multi-channel R2) — READ-ONLY
 * -----------------------------------------------------------------------------
 * GET: danh sách kênh (registry metadata) + jobCount/postedToday/accountConfigured
 * cho Channel Switcher + Overview. Local-only. KHÔNG token/secret. KHÔNG ops
 * (OAuth/refresh/scheduling là R3/R4).
 * ========================================================================== */

import { listChannelsForUi } from '@/lib/entertainment/jobs';

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
  return Response.json({ ok: true, channels: listChannelsForUi() });
}
