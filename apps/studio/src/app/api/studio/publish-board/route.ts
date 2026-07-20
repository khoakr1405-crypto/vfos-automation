/* =============================================================================
 * VFOS Studio — Publish rhythm BOARD API (Phần 82 R-C) — READ-ONLY GET
 * -----------------------------------------------------------------------------
 * GET: trả board máy tick tự đăng cho panel Tổng quan. Chỉ ĐỌC file runtime
 * publish-board.json (readPublishBoardForUi, pure read). KHÔNG POST, KHÔNG mutate,
 * KHÔNG chạy tick/publish. Local-only. board=null khi tick chưa chạy lần nào.
 * ========================================================================== */

import { readPublishBoardForUi } from '@/lib/growth-data/publish-board';

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
  return Response.json({ ok: true, board: readPublishBoardForUi() });
}
