'use client';

/* =============================================================================
 * VFOS Studio — Entertainment "Đăng lên Facebook" panel — CLIENT island
 * -----------------------------------------------------------------------------
 * ĐỔI TARGET (swap): lane Giải trí đăng Facebook Reels (trước là TikTok).
 * Card: readiness 4 đèn + caption preview/edit + ô affiliate link/CTA TUỲ CHỌN
 * (contextual affiliate) + nút "Đăng lên Facebook" (cổng tay). Owner Shopee chỉ
 * CẢNH BÁO MỀM (không chặn). Mặc định MOCK → đăng mô phỏng, KHÔNG live.
 * KHÔNG bắt Product Card, KHÔNG gate owner cứng, KHÔNG auto-publish.
 * ========================================================================== */

import { checkAffiliateLinkOwner } from '@/lib/entertainment/affiliate-owner';
// import type = chỉ lấy type, erase lúc compile — KHÔNG kéo node:fs vào client.
import type { EntAffiliateSummary } from '@/lib/entertainment/jobs';
import { useCallback, useEffect, useState } from 'react';
import { useEntLane } from './ent-lane-context';

interface Readiness {
  videoApproved: boolean;
  hasFinalVideo: boolean;
  hasCaption: boolean;
  facebookApiReady: boolean;
  notPosted: boolean;
  allReady: boolean;
}
interface FacebookSummary {
  status: 'POSTING' | 'POSTED' | 'FAILED';
  mode: string;
  videoId?: string;
  permalinkUrl?: string;
  publishVisibility?: string;
  affiliateLinkUsed?: string | null;
  contextualCtaUsed?: string | null;
  affiliateOwnerWarning?: string | null;
  postedAt?: string;
  error?: { code: string; message: string } | null;
}
interface ReadinessResp {
  ok: boolean;
  readiness?: Readiness;
  state?: string | null;
  caption?: string;
  hashtags?: string[];
  facebook?: FacebookSummary | null;
}

/** 1 dòng sản phẩm từ kho link Shopee (GET /api/studio/commerce/shopee-registry — sanitized). */
interface RegistryPickItem {
  shortLink: string;
  productName: string;
  ownerVerified: boolean;
  score?: number;
  commissionRate?: string;
  price?: string;
  lastSeenAt?: string;
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
  const [affiliateLink, setAffiliateLink] = useState('');
  const [contextualCta, setContextualCta] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Content-Led: sản phẩm Shopee gắn vào job (đọc/ghi ent_job qua API entertainment).
  const [attached, setAttached] = useState<EntAffiliateSummary | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItems, setPickerItems] = useState<RegistryPickItem[] | null>(null);
  const [affBusy, setAffBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) {
      setData(null);
      setCaption('');
      setAttached(null);
      return;
    }
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${id}/facebook-readiness`);
      const j = (await r.json()) as ReadinessResp;
      if (j.ok) {
        setData(j);
        setCaption(j.caption ?? '');
        setAffiliateLink(j.facebook?.affiliateLinkUsed ?? '');
        setContextualCta(j.facebook?.contextualCtaUsed ?? '');
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    }
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${id}/affiliate`);
      const j = (await r.json()) as { ok: boolean; affiliate?: EntAffiliateSummary | null };
      setAttached(j.ok ? (j.affiliate ?? null) : null);
    } catch {
      setAttached(null);
    }
  }, []);

  useEffect(() => {
    void load(selectedId);
  }, [selectedId, load]);

  async function openPicker() {
    setPickerOpen(true);
    if (pickerItems) return;
    try {
      // Kho link Shopee = commerce API dùng chung (sanitized, read-only) — KHÔNG
      // phải job API lane Review; ghi vào ent_job vẫn qua API entertainment.
      const r = await fetch('/api/studio/commerce/shopee-registry');
      const j = (await r.json()) as { ok: boolean; items?: RegistryPickItem[] };
      const verified = (j.items ?? [])
        .filter((i) => i.ownerVerified)
        .sort((a, b) => String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')))
        .slice(0, 10);
      setPickerItems(verified);
    } catch {
      setPickerItems([]);
    }
  }

  async function onAttach(item: RegistryPickItem) {
    if (!selectedId || affBusy) return;
    setAffBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}/affiliate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLink: item.shortLink }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        affiliate?: EntAffiliateSummary | null;
        message?: string;
        code?: string;
      };
      if (j.ok) {
        setAttached(j.affiliate ?? null);
        setPickerOpen(false);
        // Prefill link đăng FB + nhắc đóng gói lại để caption nhận link.
        setAffiliateLink(j.affiliate?.shopeeAffiliateUrl ?? '');
        setMsg('✅ Đã gắn sản phẩm — bấm "Tạo caption" để chèn link vào cuối caption.');
      } else {
        setMsg(`🛑 ${j.message ?? j.code ?? 'Gắn sản phẩm lỗi.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setAffBusy(false);
    }
  }

  async function onDetach() {
    if (!selectedId || affBusy) return;
    setAffBusy(true);
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}/affiliate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detach' }),
      });
      const j = (await r.json()) as { ok: boolean };
      if (j.ok) {
        setAttached(null);
        setAffiliateLink('');
        setMsg('Đã gỡ sản phẩm — đóng gói lại nếu caption cũ còn chứa link.');
      }
    } catch {
      /* giữ nguyên state khi lỗi mạng */
    } finally {
      setAffBusy(false);
    }
  }

  const rd = data?.readiness ?? null;
  const fb = data?.facebook ?? null;
  const ownerCheck = checkAffiliateLinkOwner(affiliateLink);

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
    if (reposting && !window.confirm('Job đã đăng Facebook. Đăng LẠI lần nữa?')) return;
    setBusy(true);
    setMsg('Đang đăng lên Facebook…');
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}/facebook-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption, affiliateLink, contextualCta, confirmRepost: reposting }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        summary?: FacebookSummary;
        message?: string;
        code?: string;
      };
      if (j.ok && j.summary) {
        setMsg(
          `✅ Đã đăng Facebook (${j.summary.mode})${j.summary.videoId ? ` · video ${j.summary.videoId}` : ''}.`,
        );
      } else {
        setMsg(`🛑 ${j.message ?? j.code ?? 'Đăng Facebook lỗi.'}`);
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
    !!rd && rd.videoApproved && rd.hasFinalVideo && rd.hasCaption && rd.facebookApiReady && !busy;

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
      {/* Đích đăng — Facebook Reels */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline/40 bg-panel/30 p-3">
        <span className="text-[11px] text-neutral-500">Đăng tới:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-blue/10 px-2 py-0.5 text-[11px] font-bold text-accent-blue">
          Facebook Reels
        </span>
        <span className="text-[11px] text-neutral-400">Trang giải trí (cấu hình server-side)</span>
      </div>

      {/* Readiness 4 đèn */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-hairline/40 bg-panel/30 p-3 sm:grid-cols-3">
        <Light on={!!rd?.videoApproved} label="Video đã duyệt" />
        <Light on={!!rd?.hasFinalVideo} label="Có video final" />
        <Light on={!!rd?.hasCaption} label="Có caption" />
        <Light on={!!rd?.facebookApiReady} label="Facebook sẵn sàng" />
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

      {/* Sản phẩm Shopee — Content-Led: chọn ở khâu ĐÓNG GÓI (ghi vào ent_job.json) */}
      <div className="space-y-2 rounded-xl border border-hairline/40 bg-panel/20 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-400">
            🛒 Sản phẩm Shopee gắn vào video (tuỳ chọn — link tự chèn cuối caption khi đóng gói)
          </span>
          {attached ? (
            <button
              type="button"
              onClick={onDetach}
              disabled={affBusy}
              className="rounded-lg border border-hairline/50 px-2 py-0.5 text-[10px] text-neutral-400 transition hover:border-accent-rose/40 hover:text-accent-rose disabled:opacity-50"
            >
              Gỡ sản phẩm
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (pickerOpen ? setPickerOpen(false) : void openPicker())}
              disabled={affBusy}
              className="rounded-lg border border-hairline/50 px-2 py-0.5 text-[10px] text-neutral-300 transition hover:border-accent-cyan/40 disabled:opacity-50"
            >
              {pickerOpen ? 'Đóng kho link' : 'Chọn từ kho link (no-click)'}
            </button>
          )}
        </div>
        {attached && (
          <div className="space-y-1 rounded-lg border border-accent-green/25 bg-accent-green/5 p-2">
            <p className="text-[11px] font-semibold text-neutral-200">
              {attached.productName ?? '(không tên)'}
            </p>
            <p className="font-mono text-[10px] text-accent-blue">{attached.shopeeAffiliateUrl}</p>
            <p className="text-[10px] text-neutral-500">
              owner <span className="font-mono">{attached.affiliateOwnerId ?? '—'}</span>{' '}
              {attached.ownerVerified ? (
                <span className="font-bold text-accent-green">✓ VERIFIED</span>
              ) : (
                <span className="font-bold text-accent-amber">chưa verify</span>
              )}
              {attached.attachedAt ? ` · gắn lúc ${attached.attachedAt}` : ''}
            </p>
          </div>
        )}
        {!attached && pickerOpen && (
          <div className="space-y-1">
            {pickerItems === null && (
              <p className="text-[10px] text-neutral-500">Đang tải kho link…</p>
            )}
            {pickerItems?.length === 0 && (
              <p className="text-[10px] text-neutral-500">
                Kho link chưa có sản phẩm VERIFIED — lấy link ở lane Review Sản phẩm trước.
              </p>
            )}
            {pickerItems?.map((item) => (
              <div
                key={item.shortLink}
                className="flex items-center justify-between gap-2 rounded-lg border border-hairline/40 bg-panel/40 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-neutral-200">{item.productName}</p>
                  <p className="font-mono text-[9px] text-neutral-500">
                    {item.shortLink}
                    {item.commissionRate ? ` · hoa hồng ${item.commissionRate}` : ''}
                    {item.price ? ` · ${item.price}` : ''}
                    {typeof item.score === 'number' ? ` · score ${item.score}/10` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onAttach(item)}
                  disabled={affBusy}
                  className="shrink-0 rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-2.5 py-1 text-[10px] font-bold text-accent-cyan transition hover:bg-accent-cyan/20 disabled:opacity-50"
                >
                  {affBusy ? '…' : 'Gắn vào job'}
                </button>
              </div>
            ))}
          </div>
        )}
        {!attached && !pickerOpen && (
          <p className="text-[10px] text-neutral-600">
            Chưa gắn sản phẩm. Content-Led: video giải trí kéo view, sản phẩm gắn ở khâu đóng gói —
            không bắt buộc.
          </p>
        )}
      </div>

      {/* Contextual affiliate (fallback nhập TAY — giữ nguyên, tuỳ chọn) */}
      <div className="space-y-1.5 rounded-xl border border-hairline/40 bg-panel/20 p-3">
        <span className="text-[11px] font-semibold text-neutral-400">
          Affiliate link theo ngữ cảnh (nhập tay, tuỳ chọn — tự điền khi gắn sản phẩm ở trên)
        </span>
        <input
          type="text"
          value={affiliateLink}
          onChange={(e) => setAffiliateLink(e.target.value)}
          placeholder="Dán link affiliate (để trống nếu không có) — không bắt buộc"
          className="w-full rounded-lg border border-hairline/50 bg-panel/40 px-2 py-1.5 text-[11px] text-neutral-200 focus:border-accent-cyan/50 focus:outline-none"
        />
        <input
          type="text"
          value={contextualCta}
          onChange={(e) => setContextualCta(e.target.value)}
          placeholder="CTA đi kèm (vd: 🎣 Cần câu mình dùng ở đây:) — tuỳ chọn"
          className="w-full rounded-lg border border-hairline/50 bg-panel/40 px-2 py-1.5 text-[11px] text-neutral-200 focus:border-accent-cyan/50 focus:outline-none"
        />
        {ownerCheck.status !== 'none' && (
          <p
            className={`text-[10px] ${
              ownerCheck.status === 'ok'
                ? 'text-accent-green'
                : ownerCheck.status === 'mismatch'
                  ? 'text-accent-rose'
                  : 'text-accent-amber'
            }`}
          >
            {ownerCheck.message}
          </p>
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
          className="rounded-xl border border-accent-blue/40 bg-accent-blue/15 px-5 py-2.5 text-sm font-bold text-accent-blue transition hover:bg-accent-blue/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Đang đăng…' : 'Đăng lên Facebook'}
        </button>
        {!canPublish && rd && (
          <span className="text-[11px] text-neutral-600">
            {!rd.videoApproved
              ? '⛔ Cần duyệt video (GATE 2).'
              : !rd.hasCaption
                ? '⛔ Tạo caption trước.'
                : !rd.facebookApiReady
                  ? '⛔ Facebook chưa sẵn sàng (env/live).'
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
      {fb && (
        <div
          className={`space-y-1 rounded-xl border p-3 ${
            fb.status === 'POSTED'
              ? 'border-accent-green/30 bg-accent-green/5'
              : fb.status === 'FAILED'
                ? 'border-accent-rose/30 bg-accent-rose/5'
                : 'border-hairline/40 bg-panel/30'
          }`}
        >
          <p className="text-[11px] font-bold text-neutral-100">
            {fb.status === 'POSTED'
              ? '✅ FACEBOOK_POSTED'
              : fb.status === 'FAILED'
                ? '⚠️ FACEBOOK_FAILED'
                : '⏳ FACEBOOK_POSTING'}{' '}
            <span className="font-normal text-neutral-500">· {fb.mode}</span>
          </p>
          {fb.postedAt && <p className="text-[10px] text-neutral-500">Đăng lúc: {fb.postedAt}</p>}
          {fb.videoId && <p className="text-[10px] text-neutral-500">video id: {fb.videoId}</p>}
          {fb.publishVisibility && (
            <p className="text-[10px] text-neutral-500">
              visibility: {fb.publishVisibility} (Operator xác nhận public bằng nick ngoài)
            </p>
          )}
          {fb.permalinkUrl && (
            <a
              href={fb.permalinkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-accent-blue underline"
            >
              {fb.permalinkUrl}
            </a>
          )}
          {fb.affiliateOwnerWarning && (
            <p className="text-[10px] text-accent-amber">{fb.affiliateOwnerWarning}</p>
          )}
          {fb.error && <p className="text-[10px] text-accent-rose">Lỗi: {fb.error.message}</p>}
        </div>
      )}

      <p className="text-[10px] text-accent-amber">
        ⚠️ READY ≠ tự đăng. Operator bấm "Đăng lên Facebook". Affiliate là contextual (tuỳ chọn) —
        không bắt Product Card, owner chỉ cảnh báo mềm.
      </p>
    </div>
  );
}
