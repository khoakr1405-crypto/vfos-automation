'use client';

import type { OperatorJobDTO, VfosJobState } from '@/lib/studio-data/types';
import { useEffect, useState } from 'react';

/**
 * Product Review Status panel — READ-ONLY, dùng ở màn điều hành (Tổng quan).
 *
 * Thay logic slash command `/review-status` bằng panel hiển thị. Panel tự fetch
 * GET /api/studio/jobs (read-only, source='real', KHÔNG mock) vì màn Tổng quan là
 * server component không giữ jobs[] ở page-level. Đây là BẢNG ĐIỀU HÀNH/tổng quan,
 * KHÔNG đặt trong lane sản xuất.
 *
 * Ràng buộc (VFOS_UI_INTEGRATION_GUARDRAIL_V1): display-only, không nút action,
 * không mutate, không gọi slash command. Cột `publish` chỉ suy từ `state` — DTO
 * không mang publishVisibility nên KHÔNG kết luận live/public.
 */

// state nội bộ (10-state machine) → khung 5 bước hiển thị của Operator.
// Mirror mapping của /review-status; KHÔNG định nghĩa lại workflow.
const STATE_TO_STEP: Record<VfosJobState, string> = {
  CREATED: '1',
  WAITING_FOR_SOURCE_VIDEO: '1',
  SOURCE_READY: '2',
  READY_TO_RENDER: '2',
  RENDERING: '3',
  READY_FOR_OPERATOR_REVIEW: '4',
  APPROVED: '4',
  REJECTED: '4',
  PACKAGED: '5',
  PUBLISHED: '5',
  FAILED: '—',
};

const STATE_ACCENT: Record<VfosJobState, string> = {
  READY_FOR_OPERATOR_REVIEW: 'text-accent-amber',
  APPROVED: 'text-accent-green',
  PACKAGED: 'text-accent-green',
  PUBLISHED: 'text-accent-green',
  FAILED: 'text-accent-rose',
  REJECTED: 'text-accent-rose',
  RENDERING: 'text-accent-blue',
  READY_TO_RENDER: 'text-accent-blue',
  SOURCE_READY: 'text-accent-blue',
  WAITING_FOR_SOURCE_VIDEO: 'text-neutral-400',
  CREATED: 'text-neutral-400',
};

const DASH = '—';
const dash = (v: string | null | undefined): string => (v == null || v === '' ? DASH : v);

function fmtTime(iso: string | null): string {
  if (!iso) return DASH;
  // ISO → "YYYY-MM-DD HH:mm" bằng cắt chuỗi (không suy diễn timezone).
  return iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso;
}

function decisionAccent(d: OperatorJobDTO['operatorDecision']): string {
  if (d === 'APPROVED') return 'text-accent-green';
  if (d === 'REJECTED') return 'text-accent-rose';
  return 'text-neutral-400';
}

function qaAccent(q: OperatorJobDTO['qaStatus']): string {
  if (q === 'PASS') return 'text-accent-green';
  if (q === 'FAIL') return 'text-accent-rose';
  if (q === 'PENDING') return 'text-accent-amber';
  return 'text-neutral-500';
}

export function ProductReviewStatusPanel() {
  const [jobs, setJobs] = useState<OperatorJobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/studio/jobs');
        const data = await res.json();
        if (!alive) return;
        // Read-only: chỉ nhận data THẬT từ route; KHÔNG dùng mock.
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setNotice(data.source === 'real' ? null : 'Nguồn dữ liệu không phải "real" — không hiển thị.');
      } catch {
        if (alive) setNotice('Không tải được trạng thái job.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const rows = [...jobs].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  const counts = rows.reduce<Record<string, number>>((acc, j) => {
    acc[j.state] = (acc[j.state] ?? 0) + 1;
    return acc;
  }, {});
  const countEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-2xl border border-hairline bg-card/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-current text-accent-amber" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Trạng thái Product Review</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Chỉ đọc — tổng quan job lane Review Sản phẩm. Không phải cửa hành động.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-500">
          Tổng: <strong className="text-neutral-300">{rows.length}</strong> job
        </span>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <p className="text-xs text-neutral-500">Đang tải trạng thái job…</p>
        ) : notice ? (
          <p className="text-xs text-accent-amber">{notice}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-neutral-500">Chưa có job nào trong lane.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {countEntries.map(([state, n]) => (
                <span
                  key={state}
                  className="rounded-full border border-hairline bg-raised/40 px-2 py-0.5 text-[10px] font-semibold text-neutral-300"
                >
                  {state}: {n}
                </span>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-hairline text-neutral-500">
                    <th className="py-1.5 pr-3 font-medium">jobId</th>
                    <th className="py-1.5 pr-3 font-medium">state</th>
                    <th className="py-1.5 pr-3 font-medium">bước</th>
                    <th className="py-1.5 pr-3 font-medium">product</th>
                    <th className="py-1.5 pr-3 font-medium">operatorDecision</th>
                    <th className="py-1.5 pr-3 font-medium">qaStatus</th>
                    <th className="py-1.5 pr-3 font-medium">publish</th>
                    <th className="py-1.5 pr-3 font-medium">updatedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.id} className="border-b border-hairline/50 text-neutral-300">
                      <td className="py-1.5 pr-3 font-mono text-neutral-200">{j.id}</td>
                      <td className={`py-1.5 pr-3 font-semibold ${STATE_ACCENT[j.state]}`}>
                        {j.state}
                      </td>
                      <td className="py-1.5 pr-3">{STATE_TO_STEP[j.state]}</td>
                      <td className="max-w-[220px] truncate py-1.5 pr-3" title={j.product}>
                        {dash(j.product)}
                      </td>
                      <td className={`py-1.5 pr-3 ${decisionAccent(j.operatorDecision)}`}>
                        {dash(j.operatorDecision)}
                      </td>
                      <td className={`py-1.5 pr-3 ${qaAccent(j.qaStatus)}`}>{dash(j.qaStatus)}</td>
                      <td className="py-1.5 pr-3">{j.state === 'PUBLISHED' ? 'PUBLISHED' : DASH}</td>
                      <td className="py-1.5 pr-3 font-mono text-neutral-500">
                        {fmtTime(j.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
