'use client';

/* =============================================================================
 * VFOS Studio — Entertainment intake panel (E-UI-2 / gom nút E-UI-7 / source-bind)
 * -----------------------------------------------------------------------------
 * Kênh có KÊNH NGUỒN TQ gắn cứng → "Xem kênh nguồn" hiện danh sách video mới nhất
 * của kênh nguồn để Operator bấm chọn, kèm nút "Lấy mới nhất" (1-bấm clip mới chưa
 * reup). Vẫn giữ ô dán URL tay làm dự phòng. Kênh chưa gắn nguồn → chỉ ô dán tay.
 * Job INTAKE_FAILED hiện lý do + nút "Tải lại"; thumbnail nạp qua proxy same-origin.
 * Tạo job: POST /api/studio/entertainment/jobs (tạo job + tải source qua 01-fetch).
 * Không đụng Product Review. Không publish.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { type EntJobLite, useEntLane } from './ent-lane-context';
import { ScoutPanel } from './scout-panel';

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

/** Rút gọn lý do lỗi cho list Job gần đây: gộp MỌI lỗi phiên Douyin (hết hạn/captcha)
 * thành 1 nhãn NGẮN trỏ về nút "Đăng nhập lại Douyin" ở khối trên — bỏ câu
 * "Chạy pnpm ent:douyin-login" (đã thay bằng nút, lặp dưới mỗi job = tường đỏ). Lỗi
 * khác → cắt còn câu đầu. Full message vẫn giữ ở tooltip (title) khi hover. */
function shortErrorLabel(msg: string | undefined): string {
  if (!msg) return 'Tải source thất bại.';
  if (/DOUYIN_SETUP_REQUIRED|captcha|xác minh|passport|đăng nhập|login|session|phiên/i.test(msg)) {
    return 'Phiên Douyin hết hạn — bấm "Đăng nhập lại Douyin" ở trên.';
  }
  const first = (msg.split(/[.\n]/)[0] ?? msg).trim();
  return first.length > 64 ? `${first.slice(0, 64)}…` : first;
}

/** Thumbnail kênh nguồn: nạp qua proxy same-origin (referer douyin); lỗi/hết hạn
 * → placeholder 🎬 thay vì ô trống (Douyin CDN chặn hotlink + signed-URL expiry). */
// Key theo thumbnail ở call-site (remount khi URL đổi) → `failed` tự reset khi
// list nạp lại signed-URL mới; tránh kẹt placeholder do lần trước hết hạn.
function CandidateThumb({ thumbnail }: { thumbnail: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!thumbnail || failed) {
    return <span className="flex h-full items-center justify-center text-2xl">🎬</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/studio/entertainment/thumb?u=${encodeURIComponent(thumbnail)}`}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

interface Candidate {
  url: string;
  title: string | null;
  durationSec: number | null;
  thumbnail: string | null;
  alreadyReused: boolean;
}
interface ListResp {
  ok: boolean;
  code?: string;
  message?: string;
  videos?: Candidate[];
  latestUnreused?: string | null;
  allReused?: boolean;
}

function fmtDur(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function IntakePanel() {
  const { jobs, selectedId, selectJob, refreshJobs, selectedChannel, refreshChannels } =
    useEntLane();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Source-channel listing state.
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [latestUnreused, setLatestUnreused] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  // Feedback riêng cho retry — render cạnh danh sách "Job gần đây" (luôn hiện khi có
  // job), KHÔNG dùng `msg` vì `msg` chỉ render trong toolbar gate theo kênh/hasSource.
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  const hasSource = selectedChannel?.hasSourceChannel === true;

  // Đổi kênh → xoá danh sách + thông báo cũ để khỏi lẫn nguồn giữa các kênh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chủ ý reset theo kênh.
  useEffect(() => {
    setCandidates(null);
    setLatestUnreused(null);
    setListMsg(null);
    setMsg(null);
    setShowManual(false);
  }, [selectedChannel?.channelId]);

  async function createJobFromUrl(u: string): Promise<void> {
    const target = u.trim();
    if (!target || busy) return;
    if (!selectedChannel) {
      setMsg('🛑 Chọn 1 kênh ở trên trước khi tạo job (job bị khoá theo kênh).');
      return;
    }
    setBusy(true);
    setMsg(`Đang tạo job cho kênh ${selectedChannel.channelName} + tải source…`);
    try {
      const r = await fetch('/api/studio/entertainment/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: target,
          niche: selectedChannel.niche,
          channelId: selectedChannel.channelId,
        }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        job?: { jobId: string; source: { durationSec?: number; hasAudio?: boolean } };
        message?: string;
      };
      if (j.ok && j.job) {
        const newId = j.job.jobId;
        setUrl('');
        // Chờ list mới CÓ newId trước khi chọn — chống reconcile-effect reset
        // selectedId về job cũ khi kênh đã có job (cùng race như retryJob).
        await refreshJobs();
        selectJob(newId);
        setMsg(
          `✅ ${newId} — đã tải (${j.job.source.durationSec ?? '?'}s, audio ${j.job.source.hasAudio ? 'có' : 'không'}). Đã chọn job này.`,
        );
        // Đánh dấu clip vừa reup trong danh sách (khỏi tải lại nhầm).
        setCandidates((prev) =>
          prev ? prev.map((c) => (c.url === target ? { ...c, alreadyReused: true } : c)) : prev,
        );
        // Xoá cache "clip mới nhất" vừa dùng — bấm "Lấy mới nhất" lần 2 phải list
        // lại thay vì tạo job trùng đúng clip này (nguồn cặp job trùng 232632/232656).
        setLatestUnreused((prev) => (prev === target ? null : prev));
      } else {
        setMsg(`🛑 ${j.message ?? 'Tải thất bại.'}`);
        // Fail (kể cả 409 DUPLICATE_SOURCE) cũng xoá cache — không thì "Lấy mới
        // nhất" cứ POST lại đúng target hỏng này mãi thay vì list lại.
        setLatestUnreused((prev) => (prev === target ? null : prev));
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
      setLatestUnreused((prev) => (prev === target ? null : prev));
    } finally {
      setBusy(false);
      void refreshJobs();
      void refreshChannels();
    }
  }

  /** Lấy danh sách video của kênh nguồn. Trả về response để nút "Lấy mới nhất" tái dùng. */
  async function loadCandidates(): Promise<ListResp | null> {
    if (!selectedChannel || listing) return null;
    setListing(true);
    setMsg(null); // msg cũ được ưu tiên hiển thị — phải xoá để không che lỗi list mới
    setListMsg('Đang lấy danh sách video của kênh nguồn…');
    try {
      const r = await fetch(
        `/api/studio/entertainment/channels/${selectedChannel.channelId}/source-videos?limit=12`,
      );
      const j = (await r.json()) as ListResp;
      if (j.ok) {
        setCandidates(j.videos ?? []);
        setLatestUnreused(j.latestUnreused ?? null);
        setListMsg(
          (j.videos?.length ?? 0) === 0
            ? 'Kênh nguồn chưa có video.'
            : j.allReused
              ? '⚠ Tất cả video đang hiện đều đã reup.'
              : null,
        );
      } else if (j.code === 'DOUYIN_SETUP_REQUIRED') {
        setListMsg(
          '🛑 Douyin cần xác minh — chạy "pnpm ent:douyin-login" trong terminal rồi thử lại.',
        );
      } else if (j.code === 'NO_SOURCE_CHANNEL') {
        setListMsg('🛑 Kênh chưa gắn nguồn — dùng ô "dán URL khác".');
        setShowManual(true);
      } else {
        setListMsg(`🛑 ${j.message ?? j.code ?? 'Không lấy được danh sách.'}`);
      }
      return j;
    } catch (e) {
      setListMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
      return null;
    } finally {
      setListing(false);
    }
  }

  async function onFetchLatest(): Promise<void> {
    // Đã có danh sách + biết clip mới nhất chưa reup → tải luôn; nếu chưa, load rồi tải.
    let target = latestUnreused;
    if (!target) {
      const j = await loadCandidates();
      // List LỖI (captcha/script/mạng) → listMsg đã chứa lỗi cụ thể; không được đè
      // bằng thông báo "hết clip" (bug cũ: mọi lỗi fetch đều hiện như hết clip).
      if (!j?.ok) return;
      target = j.latestUnreused ?? null;
      if (!target) {
        setMsg(
          (j.videos?.length ?? 0) === 0
            ? '🛑 Kênh nguồn chưa có video nào.'
            : '🛑 Không có clip mới chưa reup — tất cả video đang hiện đều đã reup.',
        );
        return;
      }
    }
    await createJobFromUrl(target);
  }

  /** Tải lại job INTAKE_FAILED: re-POST cùng source.url + kênh của job. Guard dedup
   * BỎ QUA job INTAKE_FAILED nên không dính 409 (nếu retry đã thành công trước đó,
   * 409 DUPLICATE_SOURCE sẽ hiện đúng — chặn tạo trùng). Tạo job MỚI, giữ job lỗi cũ. */
  async function retryJob(job: EntJobLite): Promise<void> {
    const target = job.source?.url;
    if (!target || retryingId) return;
    setRetryingId(job.jobId);
    setRetryMsg(`Đang tải lại ${job.jobId}…`);
    try {
      const r = await fetch('/api/studio/entertainment/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target, niche: job.niche, channelId: job.channelId }),
      });
      const j = (await r.json()) as { ok: boolean; job?: { jobId: string }; message?: string };
      if (j.ok && j.job) {
        const newId = j.job.jobId;
        // Chờ list mới CÓ newId TRƯỚC khi chọn — nếu không, reconcile-effect
        // (ent-lane-context) thấy newId chưa có trong jobs → reset selectedId về
        // job cũ nhất, khiến "Đã chọn job mới" sai và Operator thao tác nhầm job cũ.
        await refreshJobs();
        selectJob(newId);
        setRetryMsg(`✅ Tải lại thành công → ${newId}. Đã chọn job mới.`);
      } else {
        setRetryMsg(`🛑 ${j.message ?? 'Tải lại vẫn lỗi.'}`);
        void refreshJobs();
      }
    } catch (e) {
      setRetryMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
      void refreshJobs();
    } finally {
      setRetryingId(null);
      // Job mới đổi số job của kênh → refresh chip card kênh (khớp createJobFromUrl).
      void refreshChannels();
    }
  }

  return (
    <div className="space-y-3">
      {selectedChannel ? (
        <p className="text-[11px] text-neutral-500">
          Job mới sẽ thuộc kênh{' '}
          <span className="font-semibold text-accent-cyan">
            {selectedChannel.channelName} (@{selectedChannel.tiktokUsername})
          </span>{' '}
          — khoá cứng, không đổi sau khi tạo.
          {hasSource && (
            <>
              {' · '}Nguồn:{' '}
              <span className="font-semibold text-accent-amber">
                {selectedChannel.sourceLabel ?? selectedChannel.sourcePlatform}
                {selectedChannel.sourcePlatform ? ` · ${selectedChannel.sourcePlatform}` : ''}
              </span>
            </>
          )}
        </p>
      ) : (
        <p className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[11px] text-accent-amber">
          ⛔ Đang ở "Tất cả kênh" — chọn 1 kênh cụ thể ở trên để tạo job (job khoá theo kênh).
        </p>
      )}

      {/* Kênh CÓ nguồn gắn cứng: nút Tải link (mở danh sách) + Lấy mới nhất. */}
      {selectedChannel && hasSource ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadCandidates()}
              disabled={busy || listing}
              className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {listing ? 'Đang lấy danh sách…' : 'Xem kênh nguồn'}
            </button>
            <button
              type="button"
              onClick={() => void onFetchLatest()}
              disabled={busy || listing}
              className="rounded-xl border border-accent-green/40 bg-accent-green/10 px-4 py-2.5 text-sm font-semibold text-accent-green transition hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Đang tải…' : 'Lấy mới nhất'}
            </button>
            {(listMsg || msg) && (
              <span className="text-[11px] text-neutral-400">{msg ?? listMsg}</span>
            )}
          </div>

          {candidates && candidates.length > 0 && (
            <div className="grid grid-cols-2 gap-2 border-t border-hairline/40 pt-3 sm:grid-cols-3">
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.url}
                  onClick={() => void createJobFromUrl(c.url)}
                  disabled={busy || c.alreadyReused}
                  className={`flex flex-col gap-1 rounded-lg border p-2 text-left transition ${
                    c.alreadyReused
                      ? 'cursor-not-allowed border-hairline/40 bg-panel/20 opacity-60'
                      : 'border-hairline/50 bg-panel/30 hover:border-accent-cyan/40 hover:bg-panel/50'
                  }`}
                >
                  <div className="relative aspect-[9/16] overflow-hidden rounded bg-panel/60">
                    <CandidateThumb key={c.thumbnail ?? 'none'} thumbnail={c.thumbnail} />
                    {c.durationSec ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-neutral-100">
                        {fmtDur(c.durationSec)}
                      </span>
                    ) : null}
                    {c.alreadyReused && (
                      <span className="absolute left-1 top-1 rounded bg-accent-amber/80 px-1 text-[9px] font-semibold text-black">
                        đã reup
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-[10px] text-neutral-300">
                    {c.title || '(không tiêu đề)'}
                  </p>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="text-[11px] text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
          >
            {showManual ? 'Ẩn ô dán URL' : 'hoặc dán URL khác…'}
          </button>
        </>
      ) : null}

      {/* Ô dán URL tay: luôn hiện khi kênh KHÔNG có nguồn; ẩn/hiện khi kênh có nguồn. */}
      {selectedChannel && (!hasSource || showManual) && (
        <div className="space-y-2 border-t border-hairline/40 pt-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            placeholder="Dán URL hoặc cả chuỗi share Douyin/TikTok…"
            className="w-full rounded-lg border border-hairline/60 bg-panel/40 px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-accent-cyan/50 focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void createJobFromUrl(url)}
              disabled={busy || !url.trim()}
              className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Đang tải…' : hasSource ? 'Tải URL này' : 'Tải link'}
            </button>
            {msg && !hasSource && <span className="text-[11px] text-neutral-400">{msg}</span>}
          </div>
        </div>
      )}

      {/* Trend Scout — kho ứng viên Douyin sắp viral (thu gọn mặc định). */}
      <ScoutPanel />

      {jobs.length > 0 && (
        <div className="space-y-1 border-t border-hairline/40 pt-3">
          <p className="text-[11px] font-semibold text-neutral-400">
            Job gần đây <span className="text-neutral-600">(bấm để chọn cho cả 3 phần)</span>
          </p>
          {retryMsg && (
            <p className="rounded-lg bg-panel/50 px-3 py-1.5 text-[11px] text-neutral-300">
              {retryMsg}
            </p>
          )}
          {jobs.slice(0, 6).map((job) => {
            const active = job.jobId === selectedId;
            const failed = job.state === 'INTAKE_FAILED';
            return (
              <div key={job.jobId} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => selectJob(job.jobId)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1 text-left transition ${
                    active
                      ? 'border-accent-cyan/50 bg-accent-cyan/10'
                      : 'border-hairline/50 bg-panel/30 hover:bg-panel/50'
                  }`}
                >
                  {/* jobId + url gộp 1 DÒNG (truncate) — trước đây 2 dòng tốn gấp đôi. */}
                  <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-300">
                    {active && <span className="text-accent-cyan">● </span>}
                    {job.jobId}
                    <span className="ml-1.5 font-normal text-[10px] text-neutral-600">
                      {job.source?.url}
                    </span>
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {job.tiktokUsername && (
                      <span className="rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-cyan">
                        @{job.tiktokUsername}
                      </span>
                    )}
                    {job.source?.durationSec != null && (
                      <span className="text-[10px] text-neutral-500">
                        {job.source.durationSec}s
                      </span>
                    )}
                    <StatePill state={job.state} />
                  </div>
                </button>
                {/* Job lỗi tải: 1 DÒNG gọn — icon + lý do (truncate, full khi hover) +
                    nút Tải lại inline. Trước đây stack 3-4 dòng, nhiều job lỗi = tường đỏ. */}
                {failed && (
                  <div className="flex items-center gap-2 rounded-lg border border-accent-rose/25 bg-accent-rose/5 px-2.5 py-1 text-[10px] text-accent-rose">
                    <span className="shrink-0" aria-hidden>
                      ⚠
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={job.error?.message ?? 'Tải source thất bại (không rõ nguyên nhân).'}
                    >
                      {shortErrorLabel(job.error?.message)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void retryJob(job)}
                      disabled={retryingId !== null || !job.source?.url}
                      className="shrink-0 rounded border border-accent-rose/40 bg-accent-rose/10 px-2 py-0.5 font-semibold text-accent-rose transition hover:bg-accent-rose/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {retryingId === job.jobId ? 'Đang tải lại…' : '↻ Tải lại'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
