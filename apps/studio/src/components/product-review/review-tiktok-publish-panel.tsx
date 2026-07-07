'use client';

/* =============================================================================
 * VFOS Studio — Review lane "Đăng lên TikTok" panel (video-only) — CLIENT island
 * -----------------------------------------------------------------------------
 * ĐỔI TARGET lane Review: đăng video THUẦN lên TikTok (chưa affiliate/TikTok Shop
 * vòng này). Caption Operator gõ tay. Readiness 4 đèn + nút đăng (cổng tay).
 * Mặc định MOCK → đăng mô phỏng an toàn, KHÔNG live. Isolated: KHÔNG đụng state
 * machine Facebook của trang (publisher FB cũ giữ nguyên để rollback).
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';

interface Readiness {
  videoApproved: boolean;
  hasFinalVideo: boolean;
  tiktokApiReady: boolean;
  notPosted: boolean;
}
interface TikTokStatus {
  status: 'POSTING' | 'POSTED' | 'FAILED';
  mode: string;
  postId?: string;
  shareUrl?: string;
  postedAt?: string;
  error?: { code: string; message: string } | null;
}
interface Resp {
  ok: boolean;
  readiness?: Readiness;
  tiktok?: TikTokStatus | null;
}

function Light({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${on ? 'bg-accent-green' : 'bg-neutral-600'}`}
      />
      <span className={on ? 'text-neutral-200' : 'text-neutral-500'}>{label}</span>
    </div>
  );
}

export function ReviewTikTokPublishPanel({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    if (!id) {
      setData(null);
      return;
    }
    try {
      const r = await fetch(`/api/studio/jobs/${id}/publish-tiktok`);
      const j = (await r.json()) as Resp;
      setData(j.ok ? j : null);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load(jobId);
  }, [jobId, load]);

  const rd = data?.readiness ?? null;
  const tk = data?.tiktok ?? null;
  const captionOk = caption.trim().length > 0;
  const canPublish = !!rd && rd.videoApproved && rd.hasFinalVideo && rd.tiktokApiReady && captionOk && !busy;

  async function onPublish() {
    if (!jobId || busy) return;
    const reposting = rd ? !rd.notPosted : false;
    if (reposting && !window.confirm('Job đã đăng TikTok. Đăng LẠI lần nữa?')) return;
    setBusy(true);
    setMsg('Đang đăng lên TikTok…');
    try {
      const r = await fetch(`/api/studio/jobs/${jobId}/publish-tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption, confirmRepost: reposting }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        status?: TikTokStatus;
        message?: string;
        code?: string;
      };
      setMsg(
        j.ok && j.status
          ? `✅ Đã đăng TikTok (${j.status.mode})${j.status.postId ? ` · post ${j.status.postId}` : ''}.`
          : `🛑 ${j.message ?? j.code ?? 'Đăng TikTok lỗi.'}`,
      );
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(false);
      await load(jobId);
    }
  }

  if (!jobId) {
    return <p className="text-[11px] text-neutral-600">Chọn job để đăng.</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent-cyan/30 bg-accent-cyan/[0.03] p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 items-center rounded-full bg-accent-cyan/15 px-2 text-[11px] font-bold text-accent-cyan">
          TikTok
        </span>
        <span className="text-xs font-semibold text-neutral-200">
          Đăng lên TikTok (video thuần)
        </span>
      </div>

      {/* Readiness 4 đèn */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-hairline/40 bg-panel/30 p-3">
        <Light on={!!rd?.videoApproved} label="Video đã duyệt" />
        <Light on={!!rd?.hasFinalVideo} label="Có video final" />
        <Light on={!!rd?.tiktokApiReady} label="TikTok API sẵn sàng" />
        <Light on={!!rd?.notPosted} label="Chưa đăng" />
      </div>

      {/* Caption thủ công */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-neutral-400">
          Caption (gõ tay — video thuần, KHÔNG gắn link affiliate)
        </span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          placeholder="Nhập caption cho video TikTok…"
          className="w-full rounded-lg border border-hairline/50 bg-panel/40 px-2 py-1.5 text-[11px] text-neutral-200 focus:border-accent-cyan/50 focus:outline-none"
        />
      </div>

      {/* Nút */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Đang đăng…' : 'Đăng lên TikTok'}
        </button>
        {!canPublish && rd && (
          <span className="text-[11px] text-neutral-600">
            {!rd.videoApproved
              ? '⛔ Cần duyệt video.'
              : !rd.hasFinalVideo
                ? '⛔ Chưa có video final.'
                : !captionOk
                  ? '⛔ Nhập caption trước.'
                  : !rd.tiktokApiReady
                    ? '⛔ TikTok API chưa sẵn sàng (env/live).'
                    : !rd.notPosted
                      ? 'Đã đăng — bấm để đăng lại (xác nhận).'
                      : ''}
          </span>
        )}
      </div>
      {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}

      {/* Trạng thái đăng */}
      {tk && (
        <div
          className={`space-y-1 rounded-xl border p-3 ${
            tk.status === 'POSTED'
              ? 'border-accent-green/30 bg-accent-green/5'
              : tk.status === 'FAILED'
                ? 'border-accent-rose/30 bg-accent-rose/5'
                : 'border-hairline/40 bg-panel/30'
          }`}
        >
          <p className="text-[11px] font-bold text-neutral-100">
            {tk.status === 'POSTED'
              ? '✅ TIKTOK_POSTED'
              : tk.status === 'FAILED'
                ? '⚠️ TIKTOK_FAILED'
                : '⏳ TIKTOK_POSTING'}{' '}
            <span className="font-normal text-neutral-500">· {tk.mode}</span>
          </p>
          {tk.postedAt && <p className="text-[10px] text-neutral-500">Đăng lúc: {tk.postedAt}</p>}
          {tk.postId && <p className="text-[10px] text-neutral-500">post id: {tk.postId}</p>}
          {tk.shareUrl && (
            <a
              href={tk.shareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-accent-cyan underline"
            >
              {tk.shareUrl}
            </a>
          )}
          {tk.error && <p className="text-[10px] text-accent-rose">Lỗi: {tk.error.message}</p>}
        </div>
      )}

      <p className="text-[10px] text-accent-amber">
        ⚠️ READY ≠ tự đăng. Operator bấm "Đăng lên TikTok". Video thuần — chưa affiliate/TikTok Shop
        vòng này.
      </p>
    </div>
  );
}
