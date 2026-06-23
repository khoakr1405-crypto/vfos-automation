'use client';

/* =============================================================================
 * VFOS Studio — Entertainment "Đăng lên TikTok" panel (Phase 3) — CLIENT island
 * -----------------------------------------------------------------------------
 * Card 3: readiness 5 đèn + caption preview/edit + nút "Tạo caption" (đóng gói →
 * caption gpt) + nút "Đăng TikTok" (Content Posting API, cổng tay). Sau đăng hiện
 * TIKTOK_POSTED + thời gian + postId/shareUrl; lỗi hiện message sanitize.
 * Round 1: env mock → đăng mô phỏng an toàn, KHÔNG live. KHÔNG auto-publish.
 * KHÔNG Shopee/affiliate/sản phẩm.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useEntLane } from './ent-lane-context';

interface Readiness {
  videoApproved: boolean;
  hasFinalVideo: boolean;
  hasCaption: boolean;
  tiktokApiReady: boolean;
  notPosted: boolean;
  allReady: boolean;
}
interface TikTokSummary {
  status: 'POSTING' | 'POSTED' | 'FAILED';
  mode: string;
  publishId?: string;
  postId?: string;
  shareUrl?: string;
  postedAt?: string;
  error?: { code: string; message: string } | null;
}
interface ReadinessResp {
  ok: boolean;
  readiness?: Readiness;
  state?: string | null;
  caption?: string;
  hashtags?: string[];
  tiktok?: TikTokSummary | null;
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
        <span className="text-[10px] text-neutral-500">{copied ? 'Đã copy ✓' : 'Bấm để copy'}</span>
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
  const { selectedId, refreshJobs } = useEntLane();
  const [data, setData] = useState<ReadinessResp | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    if (!id) {
      setData(null);
      setCaption('');
      return;
    }
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${id}/tiktok-readiness`);
      const j = (await r.json()) as ReadinessResp;
      if (j.ok) {
        setData(j);
        setCaption(j.caption ?? '');
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load(selectedId);
  }, [selectedId, load]);

  const rd = data?.readiness ?? null;
  const tk = data?.tiktok ?? null;

  async function onGenCaption() {
    if (!selectedId || busy) return;
    setBusy(true);
    setMsg('Đang đóng gói + viết caption…');
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}/package`, {
        method: 'POST',
      });
      const j = (await r.json()) as { ok: boolean; message?: string; code?: string };
      setMsg(
        j.ok ? '✅ Đã tạo caption — xem/sửa rồi đăng.' : `🛑 ${j.message ?? j.code ?? 'Lỗi.'}`,
      );
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(false);
      await load(selectedId);
      void refreshJobs();
    }
  }

  async function onPublish() {
    if (!selectedId || busy) return;
    const reposting = rd ? !rd.notPosted : false;
    if (reposting && !window.confirm('Job đã đăng TikTok. Đăng LẠI lần nữa?')) return;
    setBusy(true);
    setMsg('Đang đăng lên TikTok…');
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}/tiktok-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption, confirmRepost: reposting }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        summary?: TikTokSummary;
        message?: string;
        code?: string;
      };
      if (j.ok && j.summary) {
        setMsg(
          `✅ Đã đăng TikTok (${j.summary.mode})${j.summary.postId ? ` · post ${j.summary.postId}` : ''}.`,
        );
      } else {
        setMsg(`🛑 ${j.message ?? j.code ?? 'Đăng TikTok lỗi.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(false);
      await load(selectedId);
      void refreshJobs();
    }
  }

  const canPublish =
    !!rd && rd.videoApproved && rd.hasFinalVideo && rd.hasCaption && rd.tiktokApiReady && !busy;

  if (!selectedId) {
    return <p className="text-[11px] text-neutral-600">Chọn job (Tải link / Sản xuất trước).</p>;
  }
  if (!data) {
    return (
      <p className="text-[11px] text-neutral-600">⛔ Cần duyệt video (GATE 2) trước khi đăng.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Readiness 5 đèn */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-hairline/40 bg-panel/30 p-3 sm:grid-cols-3">
        <Light on={!!rd?.videoApproved} label="Video đã duyệt" />
        <Light on={!!rd?.hasFinalVideo} label="Có video final" />
        <Light on={!!rd?.hasCaption} label="Có caption" />
        <Light on={!!rd?.tiktokApiReady} label="TikTok API sẵn sàng" />
        <Light on={!!rd?.notPosted} label="Chưa đăng" />
      </div>

      {/* Caption preview/edit */}
      <div className="space-y-1">
        <span className="text-[11px] font-semibold text-neutral-400">
          Caption (xem/sửa trước khi đăng)
        </span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          placeholder='Chưa có caption — bấm "Tạo caption".'
          className="w-full rounded-lg border border-hairline/50 bg-panel/40 px-2 py-1.5 text-[11px] text-neutral-200 focus:border-accent-cyan/50 focus:outline-none"
        />
        {data.hashtags && data.hashtags.length > 0 && (
          <CopyBox label={`Hashtag (${data.hashtags.length})`} value={data.hashtags.join(' ')} />
        )}
      </div>

      {/* Nút */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onGenCaption}
          disabled={busy}
          className="rounded-xl border border-hairline/60 bg-panel/40 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-accent-cyan/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '…' : 'Tạo caption'}
        </button>
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
              ? '⛔ Cần duyệt video (GATE 2).'
              : !rd.hasCaption
                ? '⛔ Tạo caption trước.'
                : !rd.tiktokApiReady
                  ? '⛔ TikTok API chưa sẵn sàng (env/live).'
                  : !rd.notPosted
                    ? 'Đã đăng — bấm để đăng lại (xác nhận).'
                    : ''}
          </span>
        )}
      </div>
      {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}

      {/* Player */}
      {/* biome-ignore lint/a11y/useMediaCaption: caption đã bake vào video */}
      <video
        controls
        className="w-full max-w-[280px] rounded-lg border border-hairline/40"
        src={`/api/studio/entertainment/jobs/${selectedId}/preview`}
      />

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
        ⚠️ READY ≠ tự đăng. Operator bấm "Đăng lên TikTok". Affiliate chưa gắn (giai đoạn xây kênh).
      </p>
    </div>
  );
}
