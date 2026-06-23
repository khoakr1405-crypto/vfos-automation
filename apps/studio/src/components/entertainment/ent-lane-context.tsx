'use client';

/* =============================================================================
 * VFOS Studio — Entertainment lane shared context (E-UI-7 gom nút)
 * -----------------------------------------------------------------------------
 * 1 nguồn job duy nhất cho cả 3 phần (Tải link / Sản xuất / Đăng TikTok) — tránh
 * 3 dropdown rời chọn lệch job. Cung cấp danh sách job + job đang chọn + refresh.
 * KHÔNG đụng API/engine/artifact — chỉ là state UI dùng chung.
 * ========================================================================== */

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface EntJobLite {
  jobId: string;
  state: string;
  source?: { url?: string; durationSec?: number };
}

interface EntLaneCtx {
  jobs: EntJobLite[];
  selectedId: string;
  selectJob: (id: string) => void;
  refreshJobs: () => Promise<void>;
}

const Ctx = createContext<EntLaneCtx | null>(null);

export function useEntLane(): EntLaneCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEntLane must be used inside <EntLaneProvider>');
  return v;
}

export function EntLaneProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<EntJobLite[]>([]);
  const [selectedId, setSelectedId] = useState('');

  const refreshJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/entertainment/jobs');
      const j = (await r.json()) as { ok: boolean; jobs?: EntJobLite[] };
      if (j.ok && j.jobs) {
        setJobs(j.jobs);
        setSelectedId((cur) => cur || j.jobs?.[0]?.jobId || '');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  const selectJob = useCallback((id: string) => setSelectedId(id), []);

  return (
    <Ctx.Provider value={{ jobs, selectedId, selectJob, refreshJobs }}>{children}</Ctx.Provider>
  );
}

/** 1 ô chọn job dùng chung — KHÔNG phải "nút", chỉ là selector ngữ cảnh. */
export function EntJobSelector() {
  const { jobs, selectedId, selectJob } = useEntLane();
  const cur = jobs.find((j) => j.jobId === selectedId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-neutral-400">Job đang chọn:</span>
      <select
        value={selectedId}
        onChange={(e) => selectJob(e.target.value)}
        className="rounded-lg border border-hairline/60 bg-panel/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-accent-cyan/50 focus:outline-none"
      >
        {jobs.length === 0 && <option value="">— chưa có job (Tải link trước) —</option>}
        {jobs.map((j) => (
          <option key={j.jobId} value={j.jobId}>
            {j.jobId} · {j.state}
          </option>
        ))}
      </select>
      {cur && (
        <span className="rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
          {cur.state}
        </span>
      )}
    </div>
  );
}
