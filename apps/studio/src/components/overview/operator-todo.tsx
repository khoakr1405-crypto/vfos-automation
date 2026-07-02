'use client';

import { GateCheckButton } from '@/components/gate-check/gate-check-modal';
import {
  TODO_BUCKET_ACCENT,
  TODO_BUCKET_LABEL,
  TODO_BUCKET_ORDER,
  TODO_BUCKET_SEVERITY,
  TODO_SEVERITY_ACCENT,
  TODO_SEVERITY_LABEL,
  TODO_SEVERITY_ORDER,
  type TodoAccent,
  type TodoBucket,
  type TodoResult,
} from '@/lib/overview/operator-todo';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Operator To-Do — surface HỢP NHẤT "việc Operator cần làm bây giờ".
 *
 * READ-ONLY, đặt ở band đầu Dashboard (app/page.tsx). Fetch 1 route aggregation
 * server-side GET /api/studio/overview/todo (đã bucket + tính gate rollup thật,
 * capped). Component chỉ render — KHÔNG bucket client, KHÔNG gọi gate-check per-job.
 *
 * Phase 2B-1: chip "Bị chặn" (BLOCKED) CHỈ hiện khi route tính được gate rollup
 * (gateComputed > 0) — KHÔNG bao giờ chip BLOCKED=0 giả.
 *
 * Phase 2B-2 (UI-only polish): gom count theo 3 severity tier (Nguy cấp / Cần thao
 * tác / Thiếu nguồn) để nhấn mức ưu tiên; dòng nguy cấp (BLOCKED/FAILED) nổi bật hơn.
 * KHÔNG đổi data model / count logic — tổng tier derive từ `counts` sẵn có.
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

// Viền + nền nhấn cho card severity khi tier có job (>0). Neutral khi rỗng.
const SEVERITY_CARD_TONE: Record<TodoAccent, string> = {
  rose: 'border-accent-rose/30 bg-accent-rose/5',
  amber: 'border-accent-amber/25 bg-accent-amber/5',
  cyan: 'border-accent-cyan/25 bg-accent-cyan/5',
  green: 'border-accent-green/25 bg-accent-green/5',
  neutral: 'border-hairline bg-raised/10',
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
        const res = await fetch('/api/studio/overview/todo');
        const data = await res.json();
        if (!alive) return;
        if (data?.ok === true) {
          setTodo(data as TodoResult);
          setLoad('ready');
        } else {
          setLoad('error');
        }
      } catch {
        if (alive) setLoad('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Chip BLOCKED chỉ hiện khi gate rollup thật đã tính (không giả 0).
  const showBlocked = (todo?.gateComputed ?? 0) > 0;
  const isDisplayable = (b: TodoBucket) => b !== 'BLOCKED' || showBlocked;

  // Gom bucket theo severity tier. Tổng tier = SUM counts của bucket hiển thị được
  // (KHÔNG đổi count logic — chỉ cộng lại các con số route đã trả). BLOCKED bị loại
  // khỏi tier "critical" khi chưa tính được gate → không giả 0.
  const severityGroups = TODO_SEVERITY_ORDER.map((sev) => {
    const buckets = TODO_BUCKET_ORDER.filter(
      (b) => TODO_BUCKET_SEVERITY[b] === sev && isDisplayable(b),
    );
    const total = buckets.reduce((sum, b) => sum + (todo?.counts[b] ?? 0), 0);
    return { sev, buckets, total };
  });

  return (
    <div className="rounded-2xl border border-hairline bg-card/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-current text-accent-blue" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Việc Operator cần làm</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Chỉ đọc — gom job cần hành động từ cả 2 lane, xếp theo mức ưu tiên. Bấm "Vào lane" để
              xử lý.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-500">
          Cần xử lý: <strong className="text-neutral-300">{todo?.totalActionable ?? 0}</strong> job
        </span>
      </div>

      <div className="px-5 py-4">
        {load === 'loading' ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-600" />
            Đang tải việc cần làm…
          </div>
        ) : load === 'error' || !todo ? (
          <div className="rounded-lg border border-accent-rose/25 bg-accent-rose/5 px-3 py-2 text-xs text-accent-rose">
            Không đọc được danh sách việc (lỗi biên dữ liệu). Dashboard vẫn an toàn — thử tải lại
            trang.
          </div>
        ) : todo.totalActionable === 0 ? (
          <div className="text-xs">
            <p className="font-medium text-neutral-300">Không có việc cần xử lý.</p>
            <p className="mt-0.5 text-neutral-500">Mọi job đang chạy hoặc đã hoàn tất.</p>
          </div>
        ) : (
          <>
            {/* Severity band — 3 tier ưu tiên, tier "Nguy cấp" (BLOCKED/FAILED) nổi bật nhất. */}
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {severityGroups.map(({ sev, buckets, total }) => {
                const tone = TODO_SEVERITY_ACCENT[sev];
                const active = total > 0;
                return (
                  <div
                    key={sev}
                    className={`rounded-xl border px-3 py-2 ${
                      active ? SEVERITY_CARD_TONE[tone] : 'border-hairline/40 bg-raised/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                          active ? TEXT_TONE[tone] : 'text-neutral-600'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${active ? DOT_TONE[tone] : 'bg-neutral-700'}`}
                        />
                        {TODO_SEVERITY_LABEL[sev]}
                      </span>
                      <span
                        className={`font-mono text-base font-bold ${active ? TEXT_TONE[tone] : 'text-neutral-600'}`}
                      >
                        {total}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      {buckets.map((b) => {
                        const n = todo.counts[b];
                        return (
                          <span
                            key={b}
                            className={`text-[10px] ${n > 0 ? 'text-neutral-400' : 'text-neutral-600'}`}
                          >
                            {TODO_BUCKET_LABEL[b]}{' '}
                            <span className="font-mono font-semibold text-neutral-300">{n}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {todo.gateCapped && todo.capNote && (
              <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-accent-amber/25 bg-accent-amber/5 px-3 py-1.5 text-[10px] text-accent-amber">
                <span aria-hidden>⚠</span>
                {todo.capNote}
              </p>
            )}

            {/* Danh sách ưu tiên — mỗi dòng read-only + "Vào lane" + gate-check drawer. */}
            <ul className="space-y-1.5">
              {todo.items.map((it) => {
                const tone = TODO_BUCKET_ACCENT[it.bucket];
                const isCritical = TODO_BUCKET_SEVERITY[it.bucket] === 'critical';
                return (
                  <li
                    key={`${it.lane}:${it.jobId}`}
                    className={`rounded-lg border px-3 py-2 text-[11px] ${
                      isCritical
                        ? 'border-accent-rose/30 bg-accent-rose/[0.06]'
                        : 'border-hairline/50 bg-raised/10'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
                      <span
                        className="font-mono text-[10px] text-neutral-500"
                        title="state gốc của job"
                      >
                        state: {it.state}
                      </span>
                      <span className="max-w-[220px] truncate text-neutral-400" title={it.label}>
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
                    </div>
                    {it.blocker && isCritical && (
                      <p
                        className="mt-1 truncate text-[10px] text-accent-rose/90"
                        title={it.blocker}
                      >
                        ⛔ {it.blocker}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-[10px] text-neutral-600">
              Bucket "Bị chặn" tính từ gate-check thật (tối đa 30 job/lần load); chi tiết gate xem
              per-job qua "Kiểm tra gate". Read-only: không có nút sản xuất/đăng ở đây.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
