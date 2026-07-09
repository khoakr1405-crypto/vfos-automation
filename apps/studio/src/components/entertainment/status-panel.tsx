'use client';

import { GateCheckButton } from '@/components/gate-check/gate-check-modal';
import { UtilIcon } from '@/components/icons';
import { PanelBadge, PanelShell } from '@/components/overview/panel-shell';
import { PipelineStepCards, type PipelineStep } from '@/components/overview/pipeline-step-cards';
import type { EntJobStatusUi } from '@/lib/entertainment/status';
import { useEffect, useState } from 'react';

/**
 * Entertainment Status panel — READ-ONLY, dùng ở màn điều hành (Tổng quan).
 *
 * Thay logic slash command `/ent-status` bằng panel hiển thị. Panel tự fetch
 * GET /api/studio/entertainment/status (read-only, nguồn = manifest ent_job.json
 * qua listJobs() pure-read). Đây là BẢNG ĐIỀU HÀNH/tổng quan, KHÔNG đặt trong lane
 * sản xuất (/lanes/content).
 *
 * Ràng buộc (VFOS_UI_INTEGRATION_GUARDRAIL_V1): display-only, không nút action,
 * không mutate, không gọi slash command, không đụng pipeline/render/BGM/blur.
 *
 * Taste v2 ("tóm tắt trước, ẩn chi tiết"): chip state luôn hiện làm tóm tắt; bảng
 * 9 cột GẬP bằng <details> native (mở khi cần) → panel gọn còn ~2 dòng khi đóng.
 * KHÔNG thêm state React, KHÔNG đổi fetch/data logic.
 */

// 6 BƯỚC pipeline hiển thị cho Operator (redesign concept — khối "Trạng thái
// lane" Giải trí): gom count THẬT từ 13-state machine. Lỗi (INTAKE_FAILED /
// TIKTOK_FAILED) tách thành chip riêng — không phải bước pipeline.
const PIPELINE_STEPS: Array<{
  label: string;
  accent: PipelineStep['accent'];
  states: string[];
  sub: string;
}> = [
  { label: 'Nguồn (intake)', accent: 'green', states: ['INTAKE_RUNNING', 'INTAKE_DONE'], sub: 'đã tải' },
  {
    label: 'Sản xuất',
    accent: 'blue',
    states: ['ANALYZED', 'MONTAGE_READY', 'SCRIPT_PENDING', 'SCRIPT_APPROVED'],
    sub: 'đang làm',
  },
  { label: 'Duyệt preview', accent: 'amber', states: ['PREVIEW_PENDING'], sub: 'chờ duyệt' },
  { label: 'Đóng gói', accent: 'cyan', states: ['APPROVED', 'PACKAGED'], sub: 'sẵn sàng đăng' },
  { label: 'Đang đăng', accent: 'violet', states: ['TIKTOK_POSTING'], sub: 'đang post' },
  { label: 'Đã đăng', accent: 'green', states: ['TIKTOK_POSTED'], sub: 'đã post' },
];
const FAILED_STATES = ['INTAKE_FAILED', 'TIKTOK_FAILED'];

const DASH = '—';
const dash = (v: string | null | undefined): string => (v == null || v === '' ? DASH : v);

function fmtTime(iso: string | null): string {
  if (!iso) return DASH;
  // ISO → "YYYY-MM-DD HH:mm" bằng cắt chuỗi (không suy diễn timezone).
  return iso.length >= 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso;
}

// Accent theo nhóm state Entertainment (13-state machine ở jobs.ts EntJobState).
function stateAccent(s: string): string {
  if (s === 'TIKTOK_POSTED' || s === 'APPROVED' || s === 'PACKAGED' || s === 'SCRIPT_APPROVED')
    return 'text-accent-green';
  if (s === 'INTAKE_FAILED' || s === 'TIKTOK_FAILED') return 'text-accent-rose';
  if (s === 'SCRIPT_PENDING' || s === 'PREVIEW_PENDING') return 'text-accent-amber';
  if (s === 'INTAKE_RUNNING' || s === 'TIKTOK_POSTING' || s === 'ANALYZED' || s === 'MONTAGE_READY')
    return 'text-accent-blue';
  return 'text-neutral-400';
}

// Gate boolean → nhãn ngắn. null (job cũ chưa có reviewGates) → `—`, không bịa PASS/FAIL.
function gate(b: boolean | null): { label: string; cls: string } {
  if (b === true) return { label: '✓', cls: 'text-accent-green' };
  if (b === false) return { label: '✗', cls: 'text-neutral-500' };
  return { label: DASH, cls: 'text-neutral-600' };
}

function verdictAccent(v: string | null): string {
  if (!v) return 'text-neutral-500';
  const up = v.toUpperCase();
  if (up.includes('PASS') || up === 'OK') return 'text-accent-green';
  if (up.includes('FAIL') || up.includes('BLOCK')) return 'text-accent-rose';
  return 'text-neutral-300';
}

export function EntertainmentStatusPanel() {
  const [jobs, setJobs] = useState<EntJobStatusUi[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/studio/entertainment/status');
        const data = await res.json();
        if (!alive) return;
        // Read-only: chỉ nhận data THẬT từ route (ok===true); KHÔNG dùng mock.
        if (data.ok === true && Array.isArray(data.jobs)) {
          setJobs(data.jobs);
        } else {
          setNotice('Không lấy được trạng thái Entertainment.');
        }
      } catch {
        if (alive) setNotice('Không tải được trạng thái job Entertainment.');
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
  // Gom count thật theo 6 bước pipeline + lỗi tách riêng.
  const steps: PipelineStep[] = PIPELINE_STEPS.map((s, i) => ({
    no: i + 1,
    label: s.label,
    accent: s.accent,
    count: s.states.reduce((sum, st) => sum + (counts[st] ?? 0), 0),
    sub: s.sub,
  }));
  const failedCount = FAILED_STATES.reduce((sum, st) => sum + (counts[st] ?? 0), 0);

  return (
    <PanelShell
      accent="violet"
      title="Trạng thái lane — Nội dung / Giải trí"
      subtitle="Chỉ đọc — job thật gom theo bước pipeline. Không phải cửa hành động."
      right={
        <PanelBadge>
          Tổng: <strong className="font-mono text-sm text-neutral-100">{rows.length}</strong> job
        </PanelBadge>
      }
    >
      <>
        {loading ? (
          <div className="space-y-2">
            <div className="flex gap-1.5" aria-hidden>
              {['sk-1', 'sk-2', 'sk-3'].map((k) => (
                <div key={k} className="h-6 w-28 animate-pulse rounded-md bg-raised/25" />
              ))}
            </div>
            <div className="h-8 animate-pulse rounded-md bg-raised/20" aria-hidden />
            <div className="h-8 animate-pulse rounded-md bg-raised/15" aria-hidden />
            <div className="h-8 animate-pulse rounded-md bg-raised/10" aria-hidden />
            <span className="sr-only">Đang tải trạng thái job…</span>
          </div>
        ) : notice ? (
          <p className="rounded-lg border border-accent-amber/25 bg-accent-amber/5 px-3 py-2 text-xs text-accent-amber">
            {notice}
          </p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-raised/30 text-neutral-600">
              <UtilIcon name="filter" width={15} height={15} />
            </span>
            <p className="text-xs text-neutral-500">Chưa có job Entertainment nào.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 6 thẻ BƯỚC pipeline — count thật gom từ state (thay chip state máy). */}
            <PipelineStepCards steps={steps} />

            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                {failedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent-rose/30 bg-accent-rose/10 px-2.5 py-1 text-[10px] font-semibold text-accent-rose">
                    <UtilIcon name="x" width={11} height={11} />
                    Lỗi (INTAKE/TIKTOK FAILED){' '}
                    <span className="font-mono text-xs font-bold tabular-nums">{failedCount}</span>
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold text-neutral-400 transition-colors duration-300 hover:text-neutral-200">
                  <span className="group-open:hidden">Xem bảng chi tiết theo state</span>
                  <span className="hidden group-open:inline">Ẩn bảng</span>
                  <UtilIcon
                    name="chevron"
                    width={12}
                    height={12}
                    className="transition-transform duration-300 ease-in-out group-open:rotate-90"
                  />
                </span>
              </summary>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-hairline font-mono text-[10px] text-neutral-500">
                    <th className="py-2.5 pr-4 font-medium">jobId</th>
                    <th className="py-2.5 pr-4 font-medium">state</th>
                    <th className="py-2.5 pr-4 font-medium">channel / account</th>
                    <th className="py-2.5 pr-4 font-medium">niche</th>
                    <th className="py-2.5 pr-4 font-medium">gates (S/P)</th>
                    <th className="py-2.5 pr-4 font-medium">reviewStatus</th>
                    <th className="py-2.5 pr-4 font-medium">render.verdict</th>
                    <th className="py-2.5 pr-4 font-medium">updatedAt</th>
                    <th className="py-2.5 pr-4 font-medium">gate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const s = gate(j.scriptApproved);
                    const p = gate(j.previewApproved);
                    return (
                      <tr
                        key={j.jobId}
                        className="border-b border-hairline/40 text-neutral-300 transition-colors duration-300 ease-in-out hover:bg-raised/20"
                      >
                        <td className="py-2.5 pr-4 font-mono text-neutral-200">{j.jobId}</td>
                        <td className={`py-2.5 pr-4 font-semibold ${stateAccent(j.state)}`}>
                          {j.state}
                        </td>
                        <td className="py-2.5 pr-4">
                          {dash(j.channelId)}
                          <span className="text-neutral-600"> / </span>
                          {dash(j.accountId)}
                        </td>
                        <td className="py-2.5 pr-4">{dash(j.channelNiche ?? j.niche)}</td>
                        <td className="py-2.5 pr-4 font-mono">
                          <span className={s.cls}>{s.label}</span>
                          <span className="text-neutral-600"> / </span>
                          <span className={p.cls}>{p.label}</span>
                        </td>
                        <td className="py-2.5 pr-4">{dash(j.scriptReviewStatus)}</td>
                        <td className={`py-2.5 pr-4 ${verdictAccent(j.renderVerdict)}`}>
                          {dash(j.renderVerdict)}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-neutral-500 tabular-nums">
                          {fmtTime(j.updatedAt)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <GateCheckButton jobId={j.jobId} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </details>
          </div>
        )}
      </>
    </PanelShell>
  );
}
