'use client';

/* =============================================================================
 * VFOS Studio — Entertainment package panel (E-UI-7 gom nút) — CLIENT island
 * -----------------------------------------------------------------------------
 * CHỈ 1 NÚT: "Đăng lên TikTok". Hiện tại = đóng gói (final mp4 + caption gpt-5.5
 * + hashtag + checklist) để đăng TAY. Caption/hashtag bấm-vào-là-copy (không nút
 * Copy riêng), player nhúng tại chỗ. KHÔNG auto-publish.
 * ROADMAP: sau này nối TikTok API → nút này tự đăng + tự viết caption như lane
 * Review (cần token + safety gate, làm ở phase riêng).
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useEntLane } from './ent-lane-context';

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

const ELIGIBLE = new Set(['APPROVED', 'PACKAGED']);

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-400">{label}</span>
        <span className="text-[10px] text-neutral-500">
          {copied ? 'Đã copy ✓' : 'Bấm vào ô để copy'}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        className="block w-full cursor-pointer rounded-lg border border-hairline/50 bg-panel/40 px-2 py-1.5 text-left text-[11px] text-neutral-200 transition hover:border-accent-cyan/40 hover:bg-panel/60"
      >
        {value}
      </button>
    </div>
  );
}

export function PackagePanel() {
  const { jobs, selectedId, refreshJobs } = useEntLane();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selJob = jobs.find((j) => j.jobId === selectedId);
  const eligible = !!selJob && ELIGIBLE.has(selJob.state);

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
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function onPackage() {
    if (!selectedId || busy || !eligible) return;
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
      void refreshJobs();
    }
  }

  const pkg = detail?.package ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPackage}
          disabled={!selectedId || busy || !eligible}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Đang đóng gói…' : 'Đăng lên TikTok'}
        </button>
        <span className="text-[11px] text-neutral-600">
          {eligible ? (
            <>
              Xuất gói + caption.{' '}
              <strong className="text-neutral-400">Anh tự đăng tay, chưa auto-publish.</strong>
            </>
          ) : (
            <>⛔ Cần duyệt video (GATE 2) ở phần "Sản xuất video" trước.</>
          )}
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

          {/* Video final nhúng tại chỗ */}
          {/* biome-ignore lint/a11y/useMediaCaption: caption đã bake vào video */}
          <video
            controls
            className="w-full max-w-[280px] rounded-lg border border-hairline/40"
            src={`/api/studio/entertainment/jobs/${selectedId}/preview`}
          />
          <p className="truncate text-[10px] text-neutral-600">{pkg.finalVideo}</p>

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
          <p className="text-[10px] text-neutral-600">
            🔜 Roadmap: nối TikTok API → nút này tự đăng + tự viết caption như lane Review (phase
            riêng, cần token + safety gate).
          </p>
        </div>
      )}
    </div>
  );
}
