'use client';

import { GateCheckButton } from '@/components/gate-check/gate-check-modal';
import { UtilIcon } from '@/components/icons';
import { PanelBadge, PanelShell } from '@/components/overview/panel-shell';
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
 * Taste polish (UI-only): skeleton loading đúng hình khối, UtilIcon thay glyph
 * unicode (⚠/⛔), hover transition 300ms, tabular-nums cho số — KHÔNG đổi logic.
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

// Icon tile vuông bo tròn (redesign concept): nền tô màu đậm + glow theo tone.
const TILE_TONE: Record<TodoAccent, string> = {
  rose: 'border-accent-rose/40 bg-accent-rose/20 text-accent-rose shadow-[0_0_18px_-4px_rgba(244,63,94,0.6)]',
  amber:
    'border-accent-amber/40 bg-accent-amber/20 text-accent-amber shadow-[0_0_18px_-4px_rgba(245,158,11,0.6)]',
  cyan: 'border-accent-cyan/40 bg-accent-cyan/20 text-accent-cyan shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]',
  green:
    'border-accent-green/40 bg-accent-green/20 text-accent-green shadow-[0_0_18px_-4px_rgba(34,197,94,0.6)]',
  neutral: 'border-hairline bg-raised/40 text-neutral-500',
};

// Viền row đặc theo tone khi tier có job (>0) — viền sáng rõ như ảnh concept.
const ROW_ACTIVE_BORDER: Record<TodoAccent, string> = {
  rose: 'border-accent-rose/25',
  amber: 'border-accent-amber/25',
  cyan: 'border-accent-cyan/25',
  green: 'border-accent-green/25',
  neutral: 'border-hairline/60',
};

// Icon đại diện tier (Nguy cấp / Cần thao tác / Thiếu nguồn).
const SEVERITY_ICON: Record<string, 'x' | 'clock' | 'download'> = {
  critical: 'x',
  action: 'clock',
  missing: 'download',
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
    <PanelShell
      accent="blue"
      title="Công việc ưu tiên"
      subtitle='Chỉ đọc — gom job cần hành động từ cả 2 lane, xếp theo mức ưu tiên. Bấm "Vào lane" để xử lý.'
      right={
        <PanelBadge>
          Cần xử lý:{' '}
          <strong className="font-mono text-sm text-neutral-100">
            {todo?.totalActionable ?? 0}
          </strong>{' '}
          job
        </PanelBadge>
      }
    >
      <>
        {load === 'loading' ? (
          <div className="space-y-2">
            {['sk-1', 'sk-2', 'sk-3'].map((k) => (
              <div
                key={k}
                aria-hidden
                className="h-[62px] animate-pulse rounded-xl border border-white/[0.04] bg-white/[0.02]"
              />
            ))}
            <span className="sr-only">Đang tải việc cần làm…</span>
          </div>
        ) : load === 'error' || !todo ? (
          <div className="rounded-lg border border-accent-rose/25 bg-accent-rose/5 px-3 py-2 text-xs text-accent-rose">
            Không đọc được danh sách việc (lỗi biên dữ liệu). Dashboard vẫn an toàn — thử tải lại
            trang.
          </div>
        ) : todo.totalActionable === 0 ? (
          <div className="flex items-center gap-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-green/25 bg-accent-green/5 text-accent-green">
              <UtilIcon name="check" width={14} height={14} />
            </span>
            <div className="text-xs">
              <p className="font-medium text-neutral-300">Không có việc cần xử lý.</p>
              <p className="mt-0.5 text-neutral-500">Mọi job đang chạy hoặc đã hoàn tất.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Danh sách ưu tiên (redesign concept) — mỗi tier = 1 row PANEL đặc:
                icon tile vuông bo tròn tô màu + nhãn + breakdown bucket, SỐ TO
                canh phải theo tone. Data = severityGroups thật, không mock. */}
            <div className="mb-3 space-y-2.5">
              {severityGroups.map(({ sev, buckets, total }) => {
                const tone = TODO_SEVERITY_ACCENT[sev];
                const active = total > 0;
                return (
                  <div
                    key={sev}
                    className={`flex items-center gap-4 rounded-xl border bg-panel/70 px-4 py-3.5 transition-colors duration-300 ease-in-out ${
                      active
                        ? `${ROW_ACTIVE_BORDER[tone]} hover:bg-panel`
                        : 'border-hairline/60 hover:border-hairline'
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                        active ? TILE_TONE[tone] : TILE_TONE.neutral
                      }`}
                    >
                      <UtilIcon name={SEVERITY_ICON[sev] ?? 'bell'} width={18} height={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold tracking-tight ${
                          active ? 'text-neutral-50' : 'text-neutral-500'
                        }`}
                      >
                        {TODO_SEVERITY_LABEL[sev]}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-neutral-500">
                        {buckets.map((b, i) => (
                          <span key={b}>
                            {i > 0 && <span className="text-neutral-700"> · </span>}
                            {TODO_BUCKET_LABEL[b]}{' '}
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                todo.counts[b] > 0 ? 'text-neutral-200' : 'text-neutral-600'
                              }`}
                            >
                              {todo.counts[b]}
                            </span>
                          </span>
                        ))}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[2rem] font-bold leading-none tabular-nums ${
                        active ? TEXT_TONE[tone] : 'text-neutral-700'
                      }`}
                    >
                      {total}
                    </span>
                  </div>
                );
              })}
            </div>

            {todo.gateCapped && todo.capNote && (
              <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-accent-amber/25 bg-accent-amber/5 px-3 py-1.5 text-[10px] text-accent-amber">
                <UtilIcon name="bell" width={12} height={12} className="shrink-0" />
                {todo.capNote}
              </p>
            )}

            {/* Danh sách chi tiết GẬP — tile phía trên đã tóm tắt; mở khi cần thao tác.
                <details> native, không thêm state. */}
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-hairline/60 px-2.5 py-1.5 text-[10px] font-semibold text-neutral-300 transition-colors duration-300 ease-in-out hover:bg-raised/30 hover:text-neutral-100 [&::-webkit-details-marker]:hidden">
                <UtilIcon
                  name="chevron"
                  width={11}
                  height={11}
                  className="transition-transform duration-300 ease-in-out group-open:rotate-90"
                />
                <span className="group-open:hidden">Xem {todo.totalActionable} việc chi tiết</span>
                <span className="hidden group-open:inline">Ẩn danh sách chi tiết</span>
              </summary>

              <ul className="mt-2 space-y-1.5">
                {todo.items.map((it) => {
                  const tone = TODO_BUCKET_ACCENT[it.bucket];
                  const isCritical = TODO_BUCKET_SEVERITY[it.bucket] === 'critical';
                  return (
                    <li
                      key={`${it.lane}:${it.jobId}`}
                      className={`rounded-lg border px-3 py-2 text-[11px] transition-colors duration-300 ease-in-out ${
                        isCritical
                          ? 'border-accent-rose/30 bg-accent-rose/[0.06] hover:bg-accent-rose/[0.1]'
                          : 'border-hairline/50 bg-raised/10 hover:border-hairline hover:bg-raised/25'
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
                        <span className="font-mono text-[10px] text-neutral-600 tabular-nums">
                          {fmtTime(it.updatedAt)}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          <Link
                            href={it.laneHref}
                            className="rounded-md border border-hairline px-2 py-1 text-[10px] font-semibold text-neutral-300 transition-all duration-300 ease-in-out hover:bg-raised/40 hover:text-neutral-100 active:scale-[0.98]"
                          >
                            Vào lane →
                          </Link>
                          <GateCheckButton jobId={it.jobId} />
                        </span>
                      </div>
                      {it.blocker && isCritical && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-accent-rose/90">
                          <UtilIcon name="x" width={11} height={11} className="shrink-0" />
                          <span className="truncate" title={it.blocker}>
                            {it.blocker}
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 text-[10px] leading-relaxed text-neutral-600">
                Bucket "Bị chặn" tính từ gate-check thật (tối đa 30 job/lần load); chi tiết gate xem
                per-job qua "Kiểm tra gate". Read-only: không có nút sản xuất/đăng ở đây.
              </p>
            </details>
          </>
        )}
      </>
    </PanelShell>
  );
}
