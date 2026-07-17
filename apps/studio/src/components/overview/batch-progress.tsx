/* =============================================================================
 * VFOS Studio — Batch Progress Panel (#2 v0, READ-ONLY)
 * -----------------------------------------------------------------------------
 * Gom job THẬT theo NGÀY tạo (createdAt, UTC) thành cohort "batch/ngày". Pure
 * presentational, derive từ jobs đã fetch ở OperatorJobQueue — KHÔNG tự fetch,
 * KHÔNG trigger production/render/publish, KHÔNG pause/resume thật (defer Phase C).
 * Mỗi job độc lập: 1 job FAILED chỉ cộng vào "lỗi", không giảm tiến độ job khác.
 * Doanh thu batch = sum evidence (G3); store rỗng → "chưa đo", KHÔNG bịa số.
 * ========================================================================== */

import type { OperatorJobDTO, VfosJobState } from '@/lib/studio-data/types';

const RUNNING_STATES = new Set<VfosJobState>([
  'CREATED',
  'WAITING_FOR_SOURCE_VIDEO',
  'SOURCE_READY',
  'READY_TO_RENDER',
  'RENDERING',
]);

const UNKNOWN = '__unknown__';

export interface BatchRow {
  key: string;
  label: string;
  /** Mốc thời gian đại diện (max createdAt trong cohort) để sắp xếp mới nhất trước. '' = không rõ. */
  sortTs: string;
  total: number;
  pendingReview: number;
  running: number;
  failed: number;
  readyToPublish: number;
  published: number;
  revenue: number;
  clicks: number;
  conversions: number;
  measuredCount: number;
  /** Số job có ≥1 snapshot ĐO TAY (engagement) — tách khỏi job chỉ có tiền Shopee. */
  engagementMeasuredCount: number;
}

const formatVnd = (n: number): string => new Intl.NumberFormat('vi-VN').format(n);

function dayKeyOf(iso: string | null): string {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function dayLabelOf(key: string): string {
  if (key === UNKNOWN) return 'Chưa rõ ngày';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

// Cohort của 1 job: batchId tường minh (#2 Phase B) ưu tiên; chưa tag → gom theo
// ngày tạo (giữ nguyên hành vi Phase A cho job legacy/đơn lẻ).
function cohortOf(j: OperatorJobDTO): { key: string; label: string } {
  if (j.batchId) return { key: `batch:${j.batchId}`, label: `Batch ${j.batchId}` };
  const dk = dayKeyOf(j.createdAt);
  return { key: dk, label: `Batch · ${dayLabelOf(dk)}` };
}

// Gom theo cohort (batchId hoặc ngày). Cohort mới nhất (max createdAt) trước; nhóm
// không rõ thời gian xuống cuối. Export để DailyRhythmStrip (Tổng quan) tái dùng
// CÙNG logic → số liệu nhịp hôm nay khớp panel batch chi tiết (single source).
export function buildBatches(jobs: OperatorJobDTO[]): BatchRow[] {
  const map = new Map<string, BatchRow>();
  for (const j of jobs) {
    const { key, label } = cohortOf(j);
    const row = map.get(key) ?? {
      key,
      label,
      sortTs: '',
      total: 0,
      pendingReview: 0,
      running: 0,
      failed: 0,
      readyToPublish: 0,
      published: 0,
      revenue: 0,
      clicks: 0,
      conversions: 0,
      measuredCount: 0,
      engagementMeasuredCount: 0,
    };
    row.total += 1;
    if (j.state === 'READY_FOR_OPERATOR_REVIEW') row.pendingReview += 1;
    else if (j.state === 'FAILED') row.failed += 1;
    else if (j.state === 'APPROVED' || j.state === 'PACKAGED') row.readyToPublish += 1;
    else if (j.state === 'PUBLISHED') row.published += 1;
    else if (RUNNING_STATES.has(j.state)) row.running += 1;
    // G1 Slice 5: chỉ tính "đã đo" khi có nguồn tiền hoặc ≥1 snapshot tay —
    // entry chỉ-Shopee không được thổi "0 clicks · 0 đơn" giả vào batch.
    if (j.evidence && (j.evidence.revenueSource || j.evidence.snapshotCount > 0)) {
      row.revenue += j.evidence.revenueSource ? j.evidence.revenue : 0;
      row.clicks += j.evidence.clicks;
      row.conversions += j.evidence.conversions;
      row.measuredCount += 1;
      if (j.evidence.snapshotCount > 0) row.engagementMeasuredCount += 1;
    }
    if (j.createdAt && j.createdAt > row.sortTs) row.sortTs = j.createdAt;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => {
    if (a.sortTs === '') return 1;
    if (b.sortTs === '') return -1;
    return b.sortTs.localeCompare(a.sortTs);
  });
}

export function BatchProgressPanel({ jobs }: { jobs: OperatorJobDTO[] }) {
  const batches = buildBatches(jobs);
  if (batches.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-hairline/60 bg-raised/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Batch theo ngày — mỗi job trạng thái/evidence riêng · lỗi 1 job không chặn batch
        </p>
        <span className="text-[10px] text-neutral-600">{batches.length} batch · read-only</span>
      </div>
      {batches.map((b) => {
        const pct = b.total > 0 ? Math.round((b.published / b.total) * 100) : 0;
        const counts: Array<{ label: string; n: number; cls: string }> = [
          { label: 'đang chạy', n: b.running, cls: 'text-accent-blue' },
          { label: 'chờ duyệt', n: b.pendingReview, cls: 'text-accent-amber' },
          { label: 'sẵn sàng', n: b.readyToPublish, cls: 'text-accent-cyan' },
          { label: 'publish', n: b.published, cls: 'text-accent-green' },
          { label: 'lỗi', n: b.failed, cls: 'text-accent-rose' },
        ];
        return (
          <div key={b.key} className="rounded-lg border border-hairline/50 bg-card/60 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-neutral-100">
                {b.label}
                <span className="ml-1.5 font-normal text-neutral-500">({b.total} job)</span>
              </span>
              <span className="text-[11px] font-semibold text-accent-green">{pct}% xong</span>
            </div>

            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent-green" style={{ width: `${pct}%` }} />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
              {counts.map((c) => (
                <span key={c.label} className={c.n > 0 ? c.cls : 'text-neutral-600'}>
                  {c.label} <span className="font-mono font-bold">{c.n}</span>
                </span>
              ))}
            </div>

            {b.failed > 0 && (
              <p className="mt-1 text-[10px] text-accent-rose/80">
                {b.failed} job lỗi — đã cô lập, {b.total - b.failed} job khác vẫn tiến hành.
              </p>
            )}

            {b.measuredCount > 0 ? (
              <p className="mt-1 text-[10px] text-neutral-400">
                Doanh thu batch:{' '}
                <span className="font-bold text-accent-green">{formatVnd(b.revenue)} đ</span>
                {b.engagementMeasuredCount > 0 && (
                  <>
                    {' '}
                    · {formatVnd(b.clicks)} clicks · {formatVnd(b.conversions)} đơn
                  </>
                )}
                <span className="text-neutral-600">
                  {' '}
                  ({b.measuredCount}/{b.total} job đã đo)
                </span>
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-neutral-600">Chưa đo doanh thu cho batch này.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
