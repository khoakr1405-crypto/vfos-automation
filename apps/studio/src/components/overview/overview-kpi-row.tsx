'use client';

import { UtilIcon, type UtilIconKey } from '@/components/icons';
import type { EntJobStatusUi } from '@/lib/entertainment/status';
import type { TodoResult } from '@/lib/overview/operator-todo';
import type { OperatorJobDTO } from '@/lib/studio-data/types';
import { useEffect, useState } from 'react';

/**
 * KPI stat-card row — hàng 5 ô đầu màn Tổng quan (redesign concept 07/2026).
 *
 * SỐ THẬT 100%, derive từ 3 route read-only sẵn có (KHÔNG route mới, KHÔNG mock):
 *   - Việc cần xử lý  = todo.totalActionable (GET /api/studio/overview/todo)
 *   - Đã duyệt/Đóng gói = đếm job state APPROVED|PACKAGED cả 2 lane
 *   - Đang làm         = đếm job state in-flight cả 2 lane
 *   - Thiếu nguồn      = todo.counts.MISSING
 *   - Hiệu suất chung  = KHÔNG có nguồn thật → bắt buộc "Chưa có số liệu"
 *     (No-Go #6 — ảnh concept ghi 87% là fixture, không được tái tạo).
 */

// In-flight = đang chạy trong pipeline, chưa cần Operator đụng tay.
const PR_IN_FLIGHT = new Set(['SOURCE_READY', 'READY_TO_RENDER', 'RENDERING']);
const ENT_IN_FLIGHT = new Set([
  'INTAKE_RUNNING',
  'INTAKE_DONE',
  'ANALYZED',
  'MONTAGE_READY',
  'SCRIPT_PENDING',
  'SCRIPT_APPROVED',
  'TIKTOK_POSTING',
]);
// Đã duyệt / đóng gói — sẵn sàng cho cổng đăng (chưa tính PUBLISHED/POSTED).
const READY_STATES = new Set(['APPROVED', 'PACKAGED']);

interface KpiCell {
  key: string;
  label: string;
  sub: string;
  icon: UtilIconKey;
  tone: 'rose' | 'green' | 'blue' | 'amber';
  value: number;
}

const TONE = {
  rose: {
    border: 'border-accent-rose/25',
    tile: 'border-accent-rose/40 bg-accent-rose/20 text-accent-rose shadow-[0_0_18px_-4px_rgba(244,63,94,0.6)]',
    num: 'text-accent-rose',
  },
  green: {
    border: 'border-accent-green/25',
    tile: 'border-accent-green/40 bg-accent-green/20 text-accent-green shadow-[0_0_18px_-4px_rgba(34,197,94,0.6)]',
    num: 'text-accent-green',
  },
  blue: {
    border: 'border-accent-blue/25',
    tile: 'border-accent-blue/40 bg-accent-blue/20 text-accent-blue shadow-[0_0_18px_-4px_rgba(59,130,246,0.6)]',
    num: 'text-accent-blue',
  },
  amber: {
    border: 'border-accent-amber/25',
    tile: 'border-accent-amber/40 bg-accent-amber/20 text-accent-amber shadow-[0_0_18px_-4px_rgba(245,158,11,0.6)]',
    num: 'text-accent-amber',
  },
} as const;

export function OverviewKpiRow() {
  const [cells, setCells] = useState<KpiCell[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [todoRes, prRes, entRes] = await Promise.all([
          fetch('/api/studio/overview/todo'),
          fetch('/api/studio/jobs'),
          fetch('/api/studio/entertainment/status'),
        ]);
        const todo = (await todoRes.json()) as TodoResult & { ok?: boolean };
        const pr = (await prRes.json()) as { jobs?: OperatorJobDTO[] };
        const ent = (await entRes.json()) as { ok?: boolean; jobs?: EntJobStatusUi[] };
        if (!alive) return;
        if (todo?.ok !== true) {
          setError(true);
          return;
        }
        const prJobs = Array.isArray(pr.jobs) ? pr.jobs : [];
        const entJobs = ent?.ok === true && Array.isArray(ent.jobs) ? ent.jobs : [];

        const ready =
          prJobs.filter((j) => READY_STATES.has(j.state)).length +
          entJobs.filter((j) => READY_STATES.has(j.state)).length;
        const inFlight =
          prJobs.filter((j) => PR_IN_FLIGHT.has(j.state)).length +
          entJobs.filter((j) => ENT_IN_FLIGHT.has(j.state)).length;

        setCells([
          {
            key: 'actionable',
            label: 'Việc cần xử lý',
            sub: 'Cần thao tác ngay',
            icon: 'bell',
            tone: 'rose',
            value: todo.totalActionable,
          },
          {
            key: 'ready',
            label: 'Đã duyệt / Đóng gói',
            sub: 'Sẵn sàng cổng đăng',
            icon: 'check',
            tone: 'green',
            value: ready,
          },
          {
            key: 'inflight',
            label: 'Đang làm',
            sub: 'Trong tiến trình',
            icon: 'play',
            tone: 'blue',
            value: inFlight,
          },
          {
            key: 'missing',
            label: 'Thiếu nguồn',
            sub: 'Cần bổ sung',
            icon: 'download',
            tone: 'amber',
            value: todo.counts.MISSING,
          },
        ]);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cells === null && !error
        ? ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'].map((k) => (
            <div
              key={k}
              aria-hidden
              className="h-[104px] animate-pulse rounded-2xl border border-hairline/50 bg-panel/60"
            />
          ))
        : (cells ?? []).map((c) => {
            const t = TONE[c.tone];
            return (
              <div
                key={c.key}
                className={`rounded-2xl border bg-gradient-to-b from-card via-panel to-panel px-4 py-3.5 transition-colors duration-300 ease-in-out hover:from-raised/60 ${t.border}`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${t.tile}`}
                  >
                    <UtilIcon name={c.icon} width={14} height={14} />
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-300">{c.label}</span>
                </div>
                <p className={`mt-2.5 font-mono text-[1.75rem] font-bold leading-none tabular-nums ${t.num}`}>
                  {c.value}
                </p>
                <p className="mt-1.5 text-[10px] text-neutral-500">{c.sub}</p>
              </div>
            );
          })}

      {/* Ô "Hiệu suất chung" — ảnh concept ghi 87% (fixture). KHÔNG có nguồn số
          thật → hiển thị trạng thái trống trung thực, không vẽ %/sparkline giả. */}
      {(cells !== null || error) && (
        <div className="rounded-2xl border border-hairline/70 bg-gradient-to-b from-card via-panel to-panel px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-raised/40 text-neutral-500">
              <UtilIcon name="sparkle" width={14} height={14} />
            </span>
            <span className="text-[11px] font-semibold text-neutral-300">Hiệu suất chung</span>
          </div>
          <p className="mt-2.5 font-mono text-[1.75rem] font-bold leading-none text-neutral-600">
            N/A
          </p>
          <p className="mt-1.5 text-[10px] text-neutral-500">
            Chưa có số liệu thật (No-Go #6) — chờ view/click/doanh thu thật.
          </p>
        </div>
      )}

      {error && (
        <p className="col-span-full rounded-lg border border-accent-rose/25 bg-accent-rose/5 px-3 py-2 text-xs text-accent-rose">
          Không đọc được số liệu KPI (lỗi biên dữ liệu). Tải lại trang để thử lại.
        </p>
      )}
    </div>
  );
}
