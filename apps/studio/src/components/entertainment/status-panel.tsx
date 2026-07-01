'use client';

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
 */

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
  const countEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-2xl border border-hairline bg-card/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-1 shrink-0 rounded-full bg-current text-accent-violet" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Trạng thái Entertainment</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Chỉ đọc — tổng quan job lane Giải trí/Vlog. Không phải cửa hành động.
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
          <p className="text-xs text-neutral-500">Chưa có job Entertainment nào.</p>
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
                    <th className="py-1.5 pr-3 font-medium">channel / account</th>
                    <th className="py-1.5 pr-3 font-medium">niche</th>
                    <th className="py-1.5 pr-3 font-medium">gates (S/P)</th>
                    <th className="py-1.5 pr-3 font-medium">reviewStatus</th>
                    <th className="py-1.5 pr-3 font-medium">render.verdict</th>
                    <th className="py-1.5 pr-3 font-medium">updatedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const s = gate(j.scriptApproved);
                    const p = gate(j.previewApproved);
                    return (
                      <tr key={j.jobId} className="border-b border-hairline/50 text-neutral-300">
                        <td className="py-1.5 pr-3 font-mono text-neutral-200">{j.jobId}</td>
                        <td className={`py-1.5 pr-3 font-semibold ${stateAccent(j.state)}`}>
                          {j.state}
                        </td>
                        <td className="py-1.5 pr-3">
                          {dash(j.channelId)}
                          <span className="text-neutral-600"> / </span>
                          {dash(j.accountId)}
                        </td>
                        <td className="py-1.5 pr-3">{dash(j.channelNiche ?? j.niche)}</td>
                        <td className="py-1.5 pr-3 font-mono">
                          <span className={s.cls}>{s.label}</span>
                          <span className="text-neutral-600"> / </span>
                          <span className={p.cls}>{p.label}</span>
                        </td>
                        <td className="py-1.5 pr-3">{dash(j.scriptReviewStatus)}</td>
                        <td className={`py-1.5 pr-3 ${verdictAccent(j.renderVerdict)}`}>
                          {dash(j.renderVerdict)}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-neutral-500">
                          {fmtTime(j.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
