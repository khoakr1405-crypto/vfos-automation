'use client';

/* =============================================================================
 * VFOS Studio — Entertainment intake panel (E-UI-2) — CLIENT island
 * -----------------------------------------------------------------------------
 * Nút "Tải link" thật: POST /api/studio/entertainment/jobs (tạo job + tải
 * source qua 01-fetch), hiện trạng thái + danh sách job gần đây. Không đụng
 * Product Review. Không publish.
 * ========================================================================== */

import { useEffect, useState } from 'react';

interface EntJob {
  jobId: string;
  niche: string;
  state: string;
  createdAt: string;
  source: { url: string; durationSec?: number; hasAudio?: boolean };
  error?: { code: string; message: string } | null;
}

const STATE_META: Record<string, { label: string; cls: string }> = {
  INTAKE_RUNNING: { label: 'Đang tải…', cls: 'bg-accent-amber/15 text-accent-amber' },
  INTAKE_DONE: { label: 'Đã tải', cls: 'bg-accent-green/15 text-accent-green' },
  INTAKE_FAILED: { label: 'Lỗi tải', cls: 'bg-accent-rose/15 text-accent-rose' },
};

function StatePill({ state }: { state: string }) {
  const meta = STATE_META[state] ?? { label: state, cls: 'bg-panel/60 text-neutral-400' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function IntakePanel() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<EntJob[]>([]);

  async function refresh() {
    try {
      const r = await fetch('/api/studio/entertainment/jobs');
      const j = (await r.json()) as { ok: boolean; jobs?: EntJob[] };
      if (j.ok && j.jobs) setJobs(j.jobs);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setMsg('Đang tạo job + tải source (có thể vài chục giây)…');
    try {
      const r = await fetch('/api/studio/entertainment/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: u, niche: 'fishing-vlog' }),
      });
      const j = (await r.json()) as { ok: boolean; job?: EntJob; message?: string };
      if (j.ok && j.job) {
        setMsg(`✅ ${j.job.jobId} — đã tải (${j.job.source.durationSec ?? '?'}s, audio ${j.job.source.hasAudio ? 'có' : 'không'}).`);
        setUrl('');
      } else {
        setMsg(`🛑 ${j.message ?? j.job?.error?.message ?? 'Tải thất bại.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div className="space-y-3">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
        placeholder="Dán URL Douyin/TikTok…"
        className="w-full rounded-lg border border-hairline/60 bg-panel/40 px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-accent-cyan/50 focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !url.trim()}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Đang tải…' : 'Tải link'}
        </button>
        {msg && <span className="text-[11px] text-neutral-400">{msg}</span>}
      </div>

      {jobs.length > 0 && (
        <div className="space-y-1.5 border-t border-hairline/40 pt-3">
          <p className="text-[11px] font-semibold text-neutral-400">Job gần đây</p>
          {jobs.slice(0, 6).map((job) => (
            <div
              key={job.jobId}
              className="flex items-center justify-between gap-2 rounded-lg border border-hairline/50 bg-panel/30 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-neutral-300">{job.jobId}</p>
                <p className="truncate text-[10px] text-neutral-600">{job.source.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {job.source.durationSec != null && (
                  <span className="text-[10px] text-neutral-500">{job.source.durationSec}s</span>
                )}
                <StatePill state={job.state} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
