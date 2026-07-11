/* =============================================================================
 * VFOS Studio — Trend Scout API — READ-ONLY GET
 * -----------------------------------------------------------------------------
 * GET: run-state + danh sách niche config + danh sách snapshot + snapshot đang
 * chọn (?run=<runId>; mặc định = mới nhất nhưng LUÔN trả runId tường minh —
 * không floating state). Pure read qua lib/entertainment/scout. KHÔNG mutate,
 * KHÔNG chạy browser. Local-only. Quét = POST ./run (route riêng).
 * ========================================================================== */

import {
  listScoutNiches,
  listScoutSnapshots,
  readScoutRunState,
  readScoutSnapshotForUi,
} from '@/lib/entertainment/scout';

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
  const runState = readScoutRunState();
  const snapshots = listScoutSnapshots();
  const url = new URL(req.url);
  const requested = url.searchParams.get('run');
  const niche = url.searchParams.get('niche');
  // runId tường minh: ?run > snapshot mới nhất CỦA ngách (?niche) > mới nhất chung.
  // Dropdown ngách trên UI là bộ lọc chính — shortlist cập nhật theo ngách đã chọn.
  const pool = niche ? snapshots.filter((s) => s.niche === niche) : snapshots;
  const runId = requested ?? pool[0]?.runId ?? null;
  const selected = runId ? readScoutSnapshotForUi(runId) : null;
  if (requested && !selected) {
    return Response.json(
      { ok: false, code: 'SNAPSHOT_NOT_FOUND', message: `Không có snapshot ${requested}.` },
      { status: 404 },
    );
  }
  return Response.json({
    ok: true,
    runState,
    niches: listScoutNiches(),
    snapshots,
    selected,
  });
}
