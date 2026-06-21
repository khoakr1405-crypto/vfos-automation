'use client';

/* =============================================================================
 * VFOS Studio — Entertainment package panel (E-UI-6) — CLIENT island
 * -----------------------------------------------------------------------------
 * Nút "Đóng gói & hướng dẫn đăng tay": từ job ĐÃ qua GATE 2 (duyệt preview) →
 * POST /package (16-package) → hiện final video + caption + hashtag + checklist
 * đăng TAY. KHÔNG auto-publish, KHÔNG TikTok API, KHÔNG affiliate.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';

interface PackageSummary {
  finalVideo: string;
  audioPolicyApplied?: boolean;
  caption: string;
  captionSource?: string;
  hashtags: string[];
  postingNotes: string[];
}
interface JobDetail {
  jobId: string;
  state: string;
  package?: PackageSummary | null;
}
interface JobListItem {
  jobId: string;
  state: string;
}

const ELIGIBLE = new Set(['APPROVED', 'PACKAGED']);

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-400">{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded border border-hairline/60 px-2 py-0.5 text-[10px] text-neutral-300 hover:bg-panel/60"
        >
          {copied ? 'Đã copy ✓' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        className="h-16 w-full resize-none rounded-lg border border-hairline/50 bg-panel/40 px-2 py-1.5 text-[11px] text-neutral-200"
      />
    </div>
  );
}

export function PackagePanel() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/entertainment/jobs');
      const j = (await r.json()) as { ok: boolean; jobs?: JobListItem[] };
      if (j.ok && j.jobs) {
        const eligible = j.jobs.filter((x) => ELIGIBLE.has(x.state));
        setJobs(eligible);
        setSelectedId((cur) => cur || eligible[0]?.jobId || '');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${id}`);
      const j = (await r.json()) as { ok: boolean; job?: JobDetail };
      setDetail(j.ok && j.job ? j.job : null);
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function onPackage() {
    if (!selectedId || busy) return;
    setBusy(true);
    setMsg('Đang đóng gói + viết caption…');
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}/package`, {
        method: 'POST',
      });
      const j = (await r.json()) as {
        ok: boolean;
        job?: JobDetail;
        message?: string;
        code?: string;
      };
      if (j.ok && j.job) {
        setDetail(j.job);
        setMsg('✅ Đã đóng gói — copy caption/hashtag rồi đăng TAY.');
      } else {
        setMsg(`🛑 ${j.message ?? j.code ?? 'Đóng gói lỗi.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(false);
      void loadJobs();
    }
  }

  const pkg = detail?.package ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-500">Job đã duyệt preview:</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={busy}
          className="rounded-lg border border-hairline/60 bg-panel/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-accent-cyan/50 focus:outline-none disabled:opacity-60"
        >
          {jobs.length === 0 && <option value="">— chưa có job qua GATE 2 —</option>}
          {jobs.map((j) => (
            <option key={j.jobId} value={j.jobId}>
              {j.jobId} · {j.state}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPackage}
          disabled={!selectedId || busy}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Đang đóng gói…' : pkg ? 'Đóng gói lại' : 'Đóng gói & hướng dẫn đăng tay'}
        </button>
        <span className="text-[11px] text-neutral-600">
          Tạo caption + hashtag + checklist.{' '}
          <strong className="text-neutral-400">KHÔNG tự đăng.</strong>
        </span>
      </div>
      {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}

      {pkg && (
        <div className="space-y-3 rounded-xl border border-accent-green/25 bg-accent-green/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-neutral-100">📦 Gói đăng tay (sẵn sàng)</h3>
            <span className="rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-400">
              caption: {pkg.captionSource ?? '?'} · audio ambient:{' '}
              {pkg.audioPolicyApplied ? '✅' : '⚠️ chưa'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <a
              href={`/api/studio/entertainment/jobs/${selectedId}/preview`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1.5 font-semibold text-accent-cyan hover:bg-accent-cyan/20"
            >
              ▶ Mở video final
            </a>
            <span className="truncate text-neutral-500">{pkg.finalVideo}</span>
          </div>

          <CopyBox label="Caption" value={pkg.caption} />
          <CopyBox label={`Hashtag (${pkg.hashtags.length})`} value={pkg.hashtags.join(' ')} />

          <div className="space-y-1 border-t border-accent-green/20 pt-2">
            <p className="text-[11px] font-semibold text-neutral-400">Checklist đăng tay</p>
            {pkg.postingNotes.map((n) => (
              <p key={n} className="text-[10px] text-neutral-500">
                ☐ {n}
              </p>
            ))}
          </div>
          <p className="text-[10px] text-accent-amber">
            ⚠️ READY ≠ được đăng tự động. Operator tự đăng tay trên TikTok. Affiliate chưa gắn.
          </p>
        </div>
      )}
    </div>
  );
}
