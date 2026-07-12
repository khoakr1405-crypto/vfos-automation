'use client';

/* =============================================================================
 * VFOS Studio — Trend Scout POV panel (lane Review Sản phẩm — Video-First intake)
 * -----------------------------------------------------------------------------
 * Bước 1 MỚI của Xưởng Review: quét Douyin ngách "pov-review" (đập hộp/nhập vai)
 * → Operator chọn video → "+ Tạo job POV" (POST /api/studio/jobs/create-from-video,
 * job sinh ở WAITING_FOR_PRODUCT) → Bước 2: gắn Product Card từ kho link
 * (promote qua commerce API audit sẵn có → POST /jobs/<id>/attach-product).
 * Scout backend dùng chung service Douyin (config/scout/pov-review.json);
 * job I/O đi qua API lane Review — KHÔNG đụng job API lane Giải trí.
 * KHÔNG auto-publish, KHÔNG download ở bước này.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';

const NICHE = 'pov-review';

interface ScoutRunState {
  state: 'idle' | 'running' | 'done' | 'captcha' | 'failed';
  niche: string | null;
  message: string | null;
}
interface ScoutCandidate {
  awemeId: string;
  url: string;
  desc: string;
  ageMinutes: number;
  diggCount: number;
  likesPerMinute: number;
  score: number;
  alreadyJobbed: boolean;
  authorNickname: string | null;
  durationSec: number | null;
  keyword: string;
}
interface ScoutResp {
  ok: boolean;
  runState?: ScoutRunState;
  selected?: { runId: string; startedAt: string; candidates?: ScoutCandidate[] } | null;
}
interface RegistryPickItem {
  shortLink: string;
  productName: string;
  ownerVerified: boolean;
  score?: number;
  commissionRate?: string;
  price?: string;
  lastSeenAt?: string;
}
interface CreatedJob {
  jobId: string;
  videoUrl: string;
  desc: string;
  attachedProduct: string | null;
}

export function TrendScoutReviewPanel() {
  const [runState, setRunState] = useState<ScoutRunState | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([]);
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);
  const [pickerItems, setPickerItems] = useState<RegistryPickItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // awemeId đang tạo / 'scan' / 'attach:<link>'
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/studio/entertainment/scout?niche=${NICHE}`);
      const j = (await r.json()) as ScoutResp;
      if (!j.ok) return;
      setRunState(j.runState ?? null);
      setSnapshotAt(j.selected?.startedAt ?? null);
      setCandidates(j.selected?.candidates ?? []);
    } catch {
      /* scout đọc lỗi — panel giữ nguyên, không phá page */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll 5s khi scout đang chạy (giống ScoutPanel lane Giải trí).
  useEffect(() => {
    if (runState?.state === 'running' && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 5000);
    }
    if (runState?.state !== 'running' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runState?.state, load]);

  async function onScan() {
    if (busy) return;
    setBusy('scan');
    setMsg(null);
    try {
      const r = await fetch('/api/studio/entertainment/scout/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: NICHE }),
      });
      const j = (await r.json()) as { ok: boolean; message?: string; code?: string };
      setMsg(
        j.ok ? '🔎 Đang quét Douyin ngách POV… (poll 5s)' : `🛑 ${j.message ?? j.code ?? 'Lỗi.'}`,
      );
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function onCreateJob(c: ScoutCandidate) {
    if (busy) return;
    setBusy(c.awemeId);
    setMsg(null);
    try {
      const r = await fetch('/api/studio/jobs/create-from-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: c.url }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        jobId?: string;
        message?: string;
        code?: string;
      };
      if (j.ok && j.jobId) {
        setCreatedJob({ jobId: j.jobId, videoUrl: c.url, desc: c.desc, attachedProduct: null });
        setMsg(`✅ Đã tạo job ${j.jobId} (WAITING_FOR_PRODUCT) — gắn sản phẩm ở bước dưới.`);
      } else {
        setMsg(`🛑 ${j.message ?? j.code ?? 'Tạo job lỗi.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(null);
    }
  }

  async function openPicker() {
    if (pickerItems) return;
    try {
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
    if (!createdJob || busy) return;
    setBusy(`attach:${item.shortLink}`);
    setMsg(null);
    try {
      // Bước A: promote entry kho link → Product Card hiện tại (CLI audit sẵn có).
      const p = await fetch('/api/studio/commerce/shopee-card-from-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortLink: item.shortLink }),
      });
      const pj = (await p.json()) as { ok: boolean; message?: string; code?: string };
      if (!pj.ok) {
        setMsg(`🛑 Promote card lỗi: ${pj.message ?? pj.code ?? '?'}`);
        return;
      }
      // Bước B: gắn card hiện tại vào job POV (server verify owner + VERIFIED).
      const a = await fetch(`/api/studio/jobs/${createdJob.jobId}/attach-product`, {
        method: 'POST',
      });
      const aj = (await a.json()) as { ok: boolean; message?: string; code?: string };
      if (aj.ok) {
        setCreatedJob({ ...createdJob, attachedProduct: item.productName });
        setMsg(
          `✅ Đã gắn "${item.productName}" vào ${createdJob.jobId} → WAITING_FOR_SOURCE_VIDEO. Tiếp: Hành động 2 (nguồn sạch → sản xuất).`,
        );
      } else {
        setMsg(`🛑 Gắn sản phẩm lỗi: ${aj.message ?? aj.code ?? '?'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(null);
    }
  }

  const fresh = candidates.filter((c) => !c.alreadyJobbed).slice(0, 8);

  return (
    <div className="space-y-3">
      {/* Thanh điều khiển quét */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline/40 bg-panel/30 p-3">
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={busy === 'scan' || runState?.state === 'running'}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-4 py-2 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runState?.state === 'running' ? 'Đang quét Douyin…' : '🔎 Quét video POV mới'}
        </button>
        <span className="text-[11px] text-neutral-500">
          Ngách: <span className="font-bold text-neutral-300">POV Review (Đập hộp/Nhập vai)</span>
          {snapshotAt ? ` · snapshot ${snapshotAt}` : ' · chưa có snapshot — bấm quét'}
        </span>
        {runState?.state === 'captcha' && (
          <span className="text-[11px] font-bold text-accent-amber">
            ⚠️ CAPTCHA — Operator xử lý tay trình duyệt Douyin rồi quét lại.
          </span>
        )}
      </div>

      {/* Shortlist video POV */}
      {fresh.length === 0 ? (
        <p className="text-[11px] text-neutral-600">
          Chưa có ứng viên mới trong snapshot — bấm "Quét video POV mới" (cần đăng nhập Douyin sẵn).
        </p>
      ) : (
        <div className="space-y-1.5">
          {fresh.map((c) => (
            <div
              key={c.awemeId}
              className="flex items-center justify-between gap-3 rounded-lg border border-hairline/40 bg-panel/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] text-neutral-200">{c.desc || '(không mô tả)'}</p>
                <p className="font-mono text-[9px] text-neutral-500">
                  score {c.score} · {c.likesPerMinute.toFixed(0)} likes/phút ·{' '}
                  {c.ageMinutes.toFixed(0)}
                  ph tuổi · ❤ {c.diggCount}
                  {c.durationSec ? ` · ${Math.round(c.durationSec)}s` : ''} · từ khóa "{c.keyword}"
                  {' · '}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-blue underline"
                  >
                    xem video
                  </a>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onCreateJob(c)}
                disabled={busy != null}
                className="shrink-0 rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1.5 text-[11px] font-bold text-accent-cyan transition hover:bg-accent-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === c.awemeId ? 'Đang tạo…' : '+ Tạo job POV'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bước 2: gắn sản phẩm cho job vừa tạo */}
      {createdJob && (
        <div className="space-y-2 rounded-xl border border-accent-cyan/25 bg-accent-cyan/5 p-3">
          <p className="text-[11px] font-bold text-neutral-100">
            Job POV vừa tạo: <span className="font-mono">{createdJob.jobId}</span>{' '}
            {createdJob.attachedProduct ? (
              <span className="text-accent-green">
                ✓ đã gắn "{createdJob.attachedProduct}" — sang Hành động 2
              </span>
            ) : (
              <span className="text-accent-amber">— CHỜ GẮN SẢN PHẨM (production bị khóa)</span>
            )}
          </p>
          <p className="truncate text-[10px] text-neutral-500">video: {createdJob.videoUrl}</p>
          {!createdJob.attachedProduct && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void openPicker()}
                className="rounded-lg border border-hairline/50 px-2.5 py-1 text-[11px] text-neutral-200 transition hover:border-accent-cyan/40"
              >
                🛒 Chọn sản phẩm Shopee từ kho link (no-click)
              </button>
              {pickerItems?.length === 0 && (
                <p className="text-[10px] text-neutral-500">
                  Kho link chưa có sản phẩm VERIFIED — lấy link Shopee mới trước.
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
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onAttach(item)}
                    disabled={busy != null}
                    className="shrink-0 rounded-lg border border-accent-green/40 bg-accent-green/10 px-2.5 py-1 text-[10px] font-bold text-accent-green transition hover:bg-accent-green/20 disabled:opacity-50"
                  >
                    {busy === `attach:${item.shortLink}` ? 'Đang gắn…' : 'Gắn vào job'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}
      <p className="text-[10px] text-neutral-600">
        Video-First: video POV kéo view trước, sản phẩm gắn ngay sau khi tạo job. Job chưa gắn sản
        phẩm bị chặn production (PRODUCT_CARD_MISSING) — không thể render/publish.
      </p>
    </div>
  );
}
