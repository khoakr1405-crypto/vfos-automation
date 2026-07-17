'use client';

/* =============================================================================
 * VFOS Studio — Daily Rhythm Strip (Phase 2 Slice A, READ-ONLY)
 * -----------------------------------------------------------------------------
 * "Nhịp sản xuất hôm nay" — kéo nhịp batch (vốn bị gập trong "Xem toàn bộ chi
 * tiết") lên thẳng Tổng quan dưới dạng 1 dải GỌN, always-visible. Tự fetch
 * /api/studio/jobs (GET read-only) rồi tái dùng buildBatches (SSOT của
 * BatchProgressPanel) → hiện COHORT MỚI NHẤT (ngày/batch gần nhất) ở dạng 1 dòng.
 * KHÔNG trigger production/render/publish. Empty/loading/error = trạng thái thật,
 * KHÔNG bịa số (No-Go #6). Lịch sử đầy đủ vẫn ở panel batch trong <details>.
 * ========================================================================== */

import type { OperatorJobDTO } from '@/lib/studio-data/types';
import { useEffect, useState } from 'react';
import { buildBatches } from './batch-progress';

type LoadState = 'loading' | 'ready' | 'error';

export function DailyRhythmStrip() {
  const [jobs, setJobs] = useState<OperatorJobDTO[]>([]);
  const [status, setStatus] = useState<LoadState>('loading');

  useEffect(() => {
    let alive = true;
    fetch('/api/studio/jobs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!alive) return;
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="h-[52px] animate-pulse rounded-xl border border-hairline/60 bg-raised/10" />
    );
  }
  if (status === 'error') {
    return (
      <div className="rounded-xl border border-hairline/60 bg-raised/10 px-4 py-3 text-[11px] text-neutral-500">
        Chưa tải được nhịp sản xuất (lỗi mạng). Thử tải lại trang.
      </div>
    );
  }

  const batches = buildBatches(jobs);
  const latest = batches[0];
  if (!latest) {
    return (
      <div className="rounded-xl border border-hairline/60 bg-raised/10 px-4 py-3 text-[11px] text-neutral-500">
        Chưa có job nào — bắt đầu video mới ở lane Review để lên nhịp sản xuất.
      </div>
    );
  }

  const pct = latest.total > 0 ? Math.round((latest.published / latest.total) * 100) : 0;
  const counts: Array<{ label: string; n: number; cls: string }> = [
    { label: 'đang chạy', n: latest.running, cls: 'text-accent-blue' },
    { label: 'chờ duyệt', n: latest.pendingReview, cls: 'text-accent-amber' },
    { label: 'sẵn sàng', n: latest.readyToPublish, cls: 'text-accent-cyan' },
    { label: 'publish', n: latest.published, cls: 'text-accent-green' },
    { label: 'lỗi', n: latest.failed, cls: 'text-accent-rose' },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-hairline/60 bg-raised/10 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-neutral-100">
          {latest.label}
          <span className="ml-1.5 font-normal text-neutral-500">({latest.total} job)</span>
        </span>
        <span className="text-[11px] font-semibold text-accent-green">{pct}% xong</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent-green" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
        {counts.map((c) => (
          <span key={c.label} className={c.n > 0 ? c.cls : 'text-neutral-600'}>
            {c.label} <span className="font-mono font-bold">{c.n}</span>
          </span>
        ))}
        {batches.length > 1 && (
          <span className="text-neutral-600">+{batches.length - 1} batch trước (xem chi tiết)</span>
        )}
      </div>

      {latest.failed > 0 && (
        <p className="text-[10px] text-accent-rose/80">
          {latest.failed} job lỗi — đã cô lập, {latest.total - latest.failed} job khác vẫn tiến
          hành.
        </p>
      )}
    </div>
  );
}
