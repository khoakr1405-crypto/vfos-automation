'use client';

/* =============================================================================
 * VFOS Studio — Trend Scout POV panel (lane Review Sản phẩm — Video-First intake)
 * -----------------------------------------------------------------------------
 * Bước 1 MỚI của Xưởng Review: quét Douyin ngách "pov-review" (đập hộp/nhập vai)
 * → Operator chọn video → "+ Tạo job POV" (POST /api/studio/jobs/create-from-video,
 * job sinh ở WAITING_FOR_PRODUCT) → Bước 2: gắn Product Card từ kho link
 * (promote qua commerce API audit sẵn có → POST /jobs/<id>/attach-product).
 * Scout backend dùng chung service Douyin (config/scout/pov-review.json);
 * quét BẮT BUỘC kèm "ngách con" (subNiche) để khóa bộ keyword — chặn quét rác
 * du lịch/phong cảnh (thiếu → server 400 SUB_NICHE_REQUIRED).
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
  signals: string[]; // FIT_STRONG/FIT_WEAK (Monetization Fit) + tín hiệu viral phụ
  alreadyJobbed: boolean;
  authorNickname: string | null;
  durationSec: number | null;
  keyword: string;
}
interface ScoutSubNiche {
  id: string;
  label: string;
}
interface ScoutNiche {
  niche: string;
  label: string;
  keywordCount: number;
  subNiches: ScoutSubNiche[]; // niche không có ngách con → mảng rỗng
}
// Đếm video bị loại theo lý do — 2 cột cuối thuộc Product Gate (lọc rác POV).
interface ScoutRejectedCounts {
  tooOld: number;
  tooNew: number;
  noTimestamp: number;
  belowFloor: number;
  noProductEvidence: number;
  garbageContent: number;
}
interface ScoutSnapshot {
  runId: string;
  startedAt: string;
  candidates?: ScoutCandidate[];
  subNiche: ScoutSubNiche | null; // null = snapshot cũ trước khi có ngách con
  productGateApplied: boolean;
  rejectedCounts: ScoutRejectedCounts;
}
interface ScoutResp {
  ok: boolean;
  runState?: ScoutRunState;
  niches?: ScoutNiche[];
  selected?: ScoutSnapshot | null;
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

export function TrendScoutReviewPanel({ onJobMutated }: { onJobMutated?: () => void }) {
  const [runState, setRunState] = useState<ScoutRunState | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([]);
  // Ngách con BẮT BUỘC khi quét pov-review — khóa bộ keyword, chặn quét rác.
  const [subNiche, setSubNiche] = useState<string | null>(null);
  const [subNiches, setSubNiches] = useState<ScoutSubNiche[]>([]);
  const [snapshotSubNiche, setSnapshotSubNiche] = useState<ScoutSubNiche | null>(null);
  // Khác null = snapshot đã qua Product Gate → hiện dòng thống kê chặn rác.
  const [gateRejects, setGateRejects] = useState<ScoutRejectedCounts | null>(null);
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);
  const [pickerItems, setPickerItems] = useState<RegistryPickItem[] | null>(null);
  // TikTok Shop ACTIVE R1 (Phần 76 đảo Phần 22): Operator dán link thủ công.
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [tiktokName, setTiktokName] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // awemeId đang tạo / 'scan' / 'attach:<link>' / 'intake'
  const [msg, setMsg] = useState<string | null>(null);
  // Tải & clean nguồn ngay tại Action 1 (UX liền mạch — tái dùng route source-intake).
  const [intake, setIntake] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [intakeMsg, setIntakeMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/studio/entertainment/scout?niche=${NICHE}`);
      const j = (await r.json()) as ScoutResp;
      if (!j.ok) return;
      setRunState(j.runState ?? null);
      setSnapshotAt(j.selected?.startedAt ?? null);
      setCandidates(j.selected?.candidates ?? []);
      setSnapshotSubNiche(j.selected?.subNiche ?? null);
      setGateRejects(j.selected?.productGateApplied === true ? j.selected.rejectedCounts : null);
      const subs = (j.niches ?? []).find((n) => n.niche === NICHE)?.subNiches ?? [];
      setSubNiches(subs);
      // Load đầu chưa chọn gì → default ngách con đầu tiên; giữ lựa chọn Operator các lần sau.
      setSubNiche((prev) => prev ?? subs[0]?.id ?? null);
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
    if (busy || !subNiche) return;
    setBusy('scan');
    setMsg(null);
    try {
      const r = await fetch('/api/studio/entertainment/scout/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: NICHE, subNiche }),
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
        setIntake('idle');
        setIntakeMsg(null);
        setMsg(`✅ Đã tạo job ${j.jobId} (WAITING_FOR_PRODUCT) — gắn sản phẩm ở bước dưới.`);
        onJobMutated?.();
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
          `✅ Đã gắn "${item.productName}" vào ${createdJob.jobId} → WAITING_FOR_SOURCE_VIDEO. Bấm "Tải & Clean nguồn video POV" ngay bên dưới.`,
        );
        onJobMutated?.();
      } else {
        setMsg(`🛑 Gắn sản phẩm lỗi: ${aj.message ?? aj.code ?? '?'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(null);
    }
  }

  // Gắn sản phẩm TikTok Shop bằng link dán tay (Phần 76): 2 bước mirror flow Shopee —
  // (A) build card TikTok Shop OPERATOR_CONFIRMED vào slot card hiện tại,
  // (B) attach card đó vào job qua đúng route attach-product (server re-validate).
  async function onAttachTikTok() {
    if (!createdJob || busy) return;
    const url = tiktokUrl.trim();
    const name = tiktokName.trim();
    if (!url || !name) return;
    setBusy('attach-tiktok');
    setMsg(null);
    try {
      const p = await fetch('/api/studio/commerce/tiktok-card-from-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name }),
      });
      const pj = (await p.json()) as { ok: boolean; message?: string; code?: string };
      if (!pj.ok) {
        setMsg(`🛑 Card TikTok Shop lỗi: ${pj.message ?? pj.code ?? '?'}`);
        return;
      }
      const a = await fetch(`/api/studio/jobs/${createdJob.jobId}/attach-product`, {
        method: 'POST',
      });
      const aj = (await a.json()) as { ok: boolean; message?: string; code?: string };
      if (aj.ok) {
        setCreatedJob({ ...createdJob, attachedProduct: `${name} · TikTok Shop` });
        setTiktokUrl('');
        setTiktokName('');
        setMsg(
          `✅ Đã gắn "${name}" (TikTok Shop — xác nhận thủ công) vào ${createdJob.jobId} → WAITING_FOR_SOURCE_VIDEO.`,
        );
        onJobMutated?.();
      } else {
        setMsg(`🛑 Gắn TikTok Shop lỗi: ${aj.message ?? aj.code ?? '?'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(null);
    }
  }

  // Tải & clean nguồn TẠI CHỖ — tái dùng y hệt contract nút Action 2:
  // POST source-intake {confirmPhrase} KHÔNG kèm sourceUrl → server tự dùng
  // sourceVideoUrl đã lưu trong manifest lúc tạo job từ Scout.
  async function onIntake() {
    if (!createdJob || busy || intake === 'running') return;
    setBusy('intake');
    setIntake('running');
    setIntakeMsg('Đang tải & clean nguồn (có thể mất ~30s)…');
    try {
      const r = await fetch(`/api/studio/jobs/${createdJob.jobId}/source-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: 'RUN SOURCE INTAKE' }),
      });
      const j = (await r.json()) as { ok: boolean; message?: string; code?: string };
      if (j.ok) {
        setIntake('done');
        setIntakeMsg(
          '✅ Nguồn đã tải & clean (SOURCE_READY) — sang Hành động 2 bấm "Chạy sản xuất video".',
        );
      } else {
        setIntake('failed');
        setIntakeMsg(`🛑 FAILED: ${j.message ?? j.code ?? 'Tải / clean nguồn thất bại.'}`);
      }
    } catch (e) {
      setIntake('failed');
      setIntakeMsg(`🛑 FAILED: ${e instanceof Error ? e.message : 'Lỗi kết nối API.'}`);
    } finally {
      setBusy(null);
      onJobMutated?.();
    }
  }

  const fresh = candidates.filter((c) => !c.alreadyJobbed).slice(0, 8);

  return (
    <div className="space-y-3">
      {/* Thanh điều khiển quét */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline/40 bg-panel/30 p-3">
        {/* Ngách con khóa bộ keyword — chọn trước rồi mới được quét. */}
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          Ngách con:
          <select
            value={subNiche ?? ''}
            onChange={(e) => setSubNiche(e.target.value)}
            disabled={busy === 'scan' || runState?.state === 'running'}
            className="rounded-lg border border-hairline/50 bg-panel/60 px-2 py-1.5 text-[11px] text-neutral-200 focus:border-accent-cyan/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Placeholder cho nhịp render đầu (chưa load xong) — tránh warning value không khớp option. */}
            {subNiche === null && <option value="">Đang tải ngách con…</option>}
            {subNiches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={busy === 'scan' || runState?.state === 'running' || !subNiche}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-4 py-2 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runState?.state === 'running' ? 'Đang quét Douyin…' : '🔎 Quét video POV mới'}
        </button>
        <span className="text-[11px] text-neutral-500">
          Ngách: <span className="font-bold text-neutral-300">POV Review (Đập hộp/Nhập vai)</span>
          {snapshotSubNiche ? ` · ngách con: ${snapshotSubNiche.label}` : null}
          {snapshotAt ? ` · snapshot ${snapshotAt}` : ' · chưa có snapshot — bấm quét'}
        </span>
        {runState?.state === 'captcha' && (
          <span className="text-[11px] font-bold text-accent-amber">
            ⚠️ CAPTCHA — Operator xử lý tay trình duyệt Douyin rồi quét lại.
          </span>
        )}
      </div>

      {/* Thống kê Product Gate — chỉ hiện khi snapshot đã lọc bằng chứng sản phẩm. */}
      {gateRejects && (
        <p className="text-[10px] text-neutral-500">
          🛡 Lọc sản phẩm: đã chặn {gateRejects.noProductEvidence} video không-sản-phẩm ·{' '}
          {gateRejects.garbageContent} video rác nội dung
        </p>
      )}

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
                <p className="truncate text-[11px] text-neutral-200">
                  {/* FIT = Monetization Fit cao (có thao tác review/đập hộp rõ) — điểm quyết định thứ hạng. */}
                  {c.signals?.includes('FIT_STRONG') && (
                    <span className="mr-1.5 rounded bg-accent-cyan/15 px-1 py-px text-[9px] font-bold text-accent-cyan">
                      FIT
                    </span>
                  )}
                  {c.desc || '(không mô tả)'}
                </p>
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

              {/* TikTok Shop ACTIVE R1 (Phần 76): dán link thủ công — card mức
                  OPERATOR_CONFIRMED (không phải VERIFIED máy móc như Shopee CDP). */}
              <div className="space-y-1.5 border-t border-hairline/30 pt-2">
                <p className="text-[10px] text-neutral-500">
                  — hoặc dán link <span className="font-bold text-neutral-300">TikTok Shop</span>{' '}
                  (xác nhận thủ công, link bị cắt sạch tham số tracking) —
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    placeholder="https://vt.tiktok.com/…"
                    className="w-56 rounded-lg border border-hairline/50 bg-panel/60 px-2 py-1.5 font-mono text-[10px] text-neutral-200 placeholder:text-neutral-600 focus:border-accent-cyan/50 focus:outline-none"
                  />
                  <input
                    value={tiktokName}
                    onChange={(e) => setTiktokName(e.target.value)}
                    placeholder="Tên sản phẩm (bắt buộc)"
                    className="w-44 rounded-lg border border-hairline/50 bg-panel/60 px-2 py-1.5 text-[10px] text-neutral-200 placeholder:text-neutral-600 focus:border-accent-cyan/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void onAttachTikTok()}
                    disabled={busy != null || !tiktokUrl.trim() || !tiktokName.trim()}
                    className="shrink-0 rounded-lg border border-accent-green/40 bg-accent-green/10 px-2.5 py-1 text-[10px] font-bold text-accent-green transition hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'attach-tiktok' ? 'Đang gắn…' : 'Gắn TikTok Shop'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bước 3 tại chỗ: đã gắn sản phẩm (WAITING_FOR_SOURCE_VIDEO) + có
              sourceVideoUrl từ Scout → tải & clean nguồn NGAY, khỏi cuộn xuống
              Action 2. Tái dùng y hệt route/confirmPhrase của nút Action 2. */}
          {createdJob.attachedProduct && (
            <div className="space-y-1.5 border-t border-hairline/30 pt-2">
              <button
                type="button"
                onClick={() => void onIntake()}
                disabled={busy != null || intake === 'running' || intake === 'done'}
                className="rounded-xl border border-accent-violet/40 bg-accent-violet/15 px-4 py-2 text-sm font-bold text-accent-violet transition hover:bg-accent-violet/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {intake === 'running'
                  ? 'Đang tải & clean nguồn…'
                  : intake === 'done'
                    ? '✓ Nguồn đã sẵn sàng'
                    : intake === 'failed'
                      ? 'Thử tải lại nguồn'
                      : '⬇ Tải & Clean nguồn video POV'}
              </button>
              {intakeMsg && (
                <p
                  className={`text-[11px] ${
                    intake === 'failed'
                      ? 'font-semibold text-accent-rose'
                      : intake === 'done'
                        ? 'text-accent-green'
                        : 'text-accent-cyan'
                  }`}
                >
                  {intakeMsg}
                </p>
              )}
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
