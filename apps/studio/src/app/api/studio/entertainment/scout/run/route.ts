/* =============================================================================
 * VFOS Studio — Trend Scout RUN API — POST khởi chạy quét (detached)
 * -----------------------------------------------------------------------------
 * POST {niche} → spawn `scripts/ent-vlog/30-scout.ts --niche <niche>` DETACHED
 * (mirror produce). Trả 202 ngay; UI poll GET ../scout (run-state) tới terminal.
 *
 * Guard trong startScoutRun:
 *  - UNKNOWN_NICHE (400): niche không có config/scout/<niche>.json.
 *  - SCOUT_RUNNING / STEP_RUNNING (409): scout dùng chung Douyin browser profile
 *    với intake/fetch — không chạy song song.
 * Scout là READ-ONLY discovery: KHÔNG tạo job, KHÔNG render/publish. CAPTCHA →
 * CLI dừng, ghi partial snapshot + run-state 'captcha' (UI hiện banner chỉ dẫn
 * ent:douyin-login) — không bypass (No-Go #4).
 * ========================================================================== */

import { startScoutRun } from '@/lib/entertainment/scout';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  let niche = '';
  try {
    const body = (await req.json()) as { niche?: unknown };
    if (typeof body.niche === 'string') niche = body.niche.trim();
  } catch {
    /* body hỏng → niche rỗng → UNKNOWN_NICHE bên dưới */
  }
  const res = startScoutRun(niche);
  if (!res.ok) {
    const status = res.code === 'UNKNOWN_NICHE' ? 400 : res.code === 'SPAWN_FAILED' ? 500 : 409;
    return Response.json(res, { status });
  }
  return Response.json(res, { status: 202 });
}
