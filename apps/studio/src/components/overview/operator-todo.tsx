'use client';

import { GateCheckButton } from '@/components/gate-check/gate-check-modal';
import type { EntJobStatusUi } from '@/lib/entertainment/status';
import {
  TODO_BUCKET_ACCENT,
  TODO_BUCKET_LABEL,
  TODO_STATE_BUCKET_ORDER,
  type TodoAccent,
  type TodoResult,
  buildOperatorTodo,
} from '@/lib/overview/operator-todo';
import type { OperatorJobDTO } from '@/lib/studio-data/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Operator To-Do — surface HỢP NHẤT "việc Operator cần làm bây giờ" (Phase 2A).
 *
 * READ-ONLY, đặt ở band đầu Dashboard (app/page.tsx). Gom job cần hành động từ
 * cả 2 lane (fetch /api/studio/jobs + /api/studio/entertainment/status, chỉ nhận
 * data THẬT), bucket qua lib pure-read buildOperatorTodo, sắp ưu tiên + đếm số.
 *
 * KHÔNG nút produce/render/package/publish (Dashboard = report, không phải make).
 * Chỉ 2 tương tác: "Vào lane" (điều hướng) + "Kiểm tra gate" (drawer read-only sẵn có).
 * Additive — KHÔNG thay/gỡ các status panel hiện có.
 */

type LoadState = 'loading' | 'ready' | 'error';

const DOT_TONE: Record<TodoAccent, string> = {
  rose: 'bg-accent-rose',
  amber: 'bg-accent-amber',
  cyan: 'bg-accent-cyan',
  green: 'bg-accent-green',
  neutral: 'bg-neutral-500',
};

const TEXT_TONE: Record<TodoAccent, string> = {
  rose: 'text-accent-rose',
  amber: 'text-accent-amber',
  cyan: 'text-accent-cyan',
  green: 'text-accent-green',
  neutral: 'text-neutral-400',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso;
}

export function OperatorTodo() {
  const [todo, setTodo] = useState<TodoResult | null>(null);
  const [load, setLoad] = useState<LoadState>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [prRes, entRes] = await Promise.all([
          fetch('/api/studio/jobs'),
          fetch('/api/studio/entertainment/status'),
        ]);
        const prData = await prRes.json();
        const entData = await entRes.json();
        if (!alive) return;
        // Chỉ nhận data THẬT — PR: source==='real'; Ent: ok===true. Không thì bỏ (không mock).
        const prJobs: OperatorJobDTO[] =
          prData?.source === 'real' && Array.isArray(prData.jobs) ? prData.jobs : [];
        const entJobs: EntJobStatusUi[] =
          entData?.ok === true && Array.isArray(entData.jobs) ? entData.jobs : [];
        setTodo(buildOperatorTodo(prJobs, entJobs));
        setLoad('ready');
      } catch {
        if (alive) setLoad('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-hairline bg-card/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-current text-accent-blue" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Việc Operator cần làm</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Chỉ đọc — gom job cần hành động từ cả 2 lane. Bấm "Vào lane" để xử lý.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-500">
          Cần xử lý: <strong className="text-neutral-300">{todo?.totalActionable ?? 0}</strong> job
        </span>
      </div>

      <div className="px-5 py-4">
        {load === 'loading' ? (
          <p className="text-xs text-neutral-500">Đang tải việc cần làm…</p>
        ) : load === 'error' ? (
          <p className="text-xs text-accent-rose">
            Không đọc được job (data boundary lỗi). Thử tải lại trang.
          </p>
        ) : !todo || todo.totalActionable === 0 ? (
          <p className="text-xs text-neutral-500">
            Không có việc cần xử lý — mọi job đang chạy hoặc đã xong.
          </p>
        ) : (
          <>
            {/* Count strip — CHỈ bucket dẫn từ job.state thật (không có "Bị chặn"/BLOCKED
                vì gate rollup chưa aggregate ở 2A). Dim khi 0. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {TODO_STATE_BUCKET_ORDER.map((b) => {
                const n = todo.counts[b];
                const tone = TODO_BUCKET_ACCENT[b];
                return (
                  <span
                    key={b}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                      n > 0
                        ? `border-hairline bg-raised/40 ${TEXT_TONE[tone]}`
                        : 'border-hairline/40 text-neutral-600'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${n > 0 ? DOT_TONE[tone] : 'bg-neutral-700'}`}
                    />
                    {TODO_BUCKET_LABEL[b]}
                    <span className="font-mono font-bold">{n}</span>
                  </span>
                );
              })}
            </div>

            {/* Danh sách ưu tiên — mỗi dòng read-only + "Vào lane" + gate-check drawer. */}
            <ul className="space-y-1.5">
              {todo.items.map((it) => {
                const tone = TODO_BUCKET_ACCENT[it.bucket];
                return (
                  <li
                    key={`${it.lane}:${it.jobId}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-hairline/50 bg-raised/10 px-3 py-2 text-[11px]"
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${TEXT_TONE[tone]}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${DOT_TONE[tone]}`} />
                      {TODO_BUCKET_LABEL[it.bucket]}
                    </span>
                    <span className="font-mono text-neutral-200">{it.jobId}</span>
                    <span className="rounded border border-hairline/60 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {it.laneLabel}
                    </span>
                    <span className="max-w-[240px] truncate text-neutral-400" title={it.label}>
                      {it.label}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-600">
                      {fmtTime(it.updatedAt)}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <Link
                        href={it.laneHref}
                        className="rounded-md border border-hairline px-2 py-1 text-[10px] font-semibold text-neutral-300 transition hover:bg-raised/40 hover:text-neutral-100"
                      >
                        Vào lane →
                      </Link>
                      <GateCheckButton jobId={it.jobId} />
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-[10px] text-neutral-600">
              Gate blocker xem trong từng job qua "Kiểm tra gate"; tổng hợp blocker sẽ làm ở Phase
              2B. Read-only: không có nút sản xuất/đăng ở đây.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
