'use client';

/* =============================================================================
 * VFOS Studio — Trend Scout panel (Kho ứng viên) — trong Action 1 "Tải link"
 * -----------------------------------------------------------------------------
 * Tự động hóa quy trình "10 phút/ngày": bấm "Quét Douyin" → CLI scout chạy ngầm
 * (detached, poll 5s) → bảng top ứng viên xếp theo tốc độ tăng like (likes/phút,
 * cửa sổ 30ph–6h) → bấm "➕ Tạo job" đi qua ĐÚNG intake có sẵn (409 chặn trùng).
 *
 * - Mặc định THU GỌN — giữ nguyên cấu trúc 4 nút của lane (E-UI-8).
 * - Snapshot tường minh theo runId (dropdown; mặc định mới nhất).
 * - CAPTCHA → banner chỉ dẫn `pnpm ent:douyin-login` (wait-resume, không chết cứng).
 * - Tạo job bị khóa khi scout đang chạy (chung trình duyệt Douyin với intake).
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useEntLane } from './ent-lane-context';

interface RunStateUi {
  state: 'idle' | 'running' | 'done' | 'captcha' | 'failed';
  runId: string | null;
  niche: string | null;
  startedAt: string | null;
  message: string | null;
}
interface NicheUi {
  niche: string;
  label: string;
  keywordCount: number;
}
interface SnapshotMetaUi {
  runId: string;
  niche: string;
  startedAt: string;
  status: string;
  candidateCount: number;
}
interface CandidateUi {
  awemeId: string;
  url: string;
  desc: string;
  ageMinutes: number;
  diggCount: number;
  commentCount: number;
  likesPerMinute: number;
  score: number;
  signals: string[];
  reason: string;
  alreadyJobbed: boolean;
  authorNickname: string | null;
  durationSec: number | null;
  keyword: string;
}
interface SnapshotUi {
  runId: string;
  niche: string;
  startedAt: string;
  status: string;
  keywordsCompleted: number;
  keywordCount: number;
  rejectedCounts: { tooOld: number; tooNew: number; noTimestamp: number; belowFloor: number };
  domOnlyCount: number;
  candidates: CandidateUi[];
}
interface ScoutResp {
  ok: boolean;
  code?: string;
  message?: string;
  runState?: RunStateUi;
  niches?: NicheUi[];
  snapshots?: SnapshotMetaUi[];
  selected?: SnapshotUi | null;
}

const SIGNAL_META: Record<string, { label: string; cls: string }> = {
  VERY_STRONG: { label: 'rất mạnh', cls: 'bg-accent-green/15 text-accent-green' },
  STRONG: { label: 'mạnh', cls: 'bg-accent-cyan/15 text-accent-cyan' },
  WARM: { label: 'ấm', cls: 'bg-accent-amber/15 text-accent-amber' },
  COMMENTS_HOT: { label: 'cmt nóng', cls: 'bg-accent-rose/15 text-accent-rose' },
  FRESH_LT_60M: { label: '<60ph', cls: 'bg-panel/60 text-neutral-400' },
  ALREADY_JOBBED: { label: 'đã có job', cls: 'bg-accent-amber/20 text-accent-amber' },
};

function fmtAge(min: number): string {
  if (min < 60) return `${Math.round(min)}ph`;
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
}
function fmtCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
function fmtTime(iso: string | null): string {
  if (!iso) return '?';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '?' : d.toLocaleTimeString('vi-VN', { hour12: false });
}

export function ScoutPanel() {
  const { selectedChannel, selectJob, refreshJobs, refreshChannels } = useEntLane();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ScoutResp | null>(null);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [niche, setNiche] = useState<string>('');
  const [busyScan, setBusyScan] = useState(false);
  const [busyPromote, setBusyPromote] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Dropdown ngách = bộ lọc CHÍNH: ?niche → server trả snapshot MỚI NHẤT của
  // ngách đó (runId vẫn tường minh trong response). ?run chỉ dùng khi Operator
  // ghim 1 snapshot cụ thể trong dropdown snapshot (đã lọc theo ngách).
  const fetchData = useCallback(async (opts?: { run?: string; niche?: string }) => {
    try {
      const q = opts?.run
        ? `?run=${encodeURIComponent(opts.run)}`
        : opts?.niche
          ? `?niche=${encodeURIComponent(opts.niche)}`
          : '';
      const r = await fetch(`/api/studio/entertainment/scout${q}`);
      const j = (await r.json()) as ScoutResp;
      if (j.ok) {
        setData(j);
        setSelectedRun(j.selected?.runId ?? '');
        setNiche((prev) => prev || j.selected?.niche || j.niches?.[0]?.niche || '');
      } else {
        setMsg(`🛑 ${j.message ?? j.code ?? 'Không đọc được dữ liệu scout.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    }
  }, []);

  // Mở panel lần đầu → nạp dữ liệu.
  useEffect(() => {
    if (open && data === null) void fetchData();
  }, [open, data, fetchData]);

  // Poll 5s khi đang quét (chỉ khi panel mở) — dừng ở trạng thái terminal.
  // Poll theo NGÁCH (không ghim run) để snapshot mới của ngách tự hiện khi quét xong.
  const runningNow = data?.runState?.state === 'running';
  useEffect(() => {
    if (!open || !runningNow) return;
    const t = setInterval(() => void fetchData(niche ? { niche } : undefined), 5000);
    return () => clearInterval(t);
  }, [open, runningNow, niche, fetchData]);

  async function onScan(): Promise<void> {
    if (busyScan || !niche) return;
    setBusyScan(true);
    setMsg(null);
    try {
      const r = await fetch('/api/studio/entertainment/scout/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ niche }),
      });
      const j = (await r.json()) as { ok: boolean; message?: string };
      if (!j.ok) setMsg(`🛑 ${j.message ?? 'Không khởi chạy được quét.'}`);
      await fetchData(niche ? { niche } : undefined);
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusyScan(false);
    }
  }

  async function onPromote(c: CandidateUi): Promise<void> {
    if (busyPromote || runningNow) return;
    if (!selectedChannel) {
      setMsg('🛑 Chọn 1 kênh ở trên trước khi tạo job (job bị khoá theo kênh).');
      return;
    }
    setBusyPromote(c.url);
    setMsg(`Đang tạo job từ ứng viên ${c.awemeId} cho kênh ${selectedChannel.channelName}…`);
    try {
      const r = await fetch('/api/studio/entertainment/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: c.url,
          niche: selectedChannel.niche,
          channelId: selectedChannel.channelId,
        }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        job?: { jobId: string; source: { durationSec?: number }; error?: { message?: string } };
        message?: string;
      };
      const markJobbed = () =>
        setData((prev) =>
          prev?.selected
            ? {
                ...prev,
                selected: {
                  ...prev.selected,
                  candidates: prev.selected.candidates.map((x) =>
                    x.awemeId === c.awemeId ? { ...x, alreadyJobbed: true } : x,
                  ),
                },
              }
            : prev,
        );
      if (j.ok && j.job) {
        setMsg(
          `✅ ${j.job.jobId} — đã tải (${j.job.source.durationSec ?? '?'}s). Đã chọn job này.`,
        );
        selectJob(j.job.jobId);
        markJobbed(); // cờ tại chỗ — lần fetch sau server cũng tự tính lại
      } else if (r.status === 409) {
        // Trùng nguồn: nói thẳng thay vì "thất bại" chung chung + khoá nút luôn.
        setMsg(`🛑 Video đã có trong hệ thống — ${j.message ?? 'đã có job cho video này.'}`);
        markJobbed();
      } else {
        // Lỗi thật từ intake (vd Douyin captcha) — hiện verbatim, kèm hướng xử lý.
        setMsg(`🛑 ${j.message ?? j.job?.error?.message ?? 'Tạo job thất bại.'}`);
      }
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusyPromote(null);
      void refreshJobs();
      void refreshChannels();
    }
  }

  const runState = data?.runState;
  const selected = data?.selected ?? null;
  // Dropdown snapshot chỉ hiện các lượt quét CỦA ngách đang chọn (bộ lọc chính).
  const nicheSnapshots = (data?.snapshots ?? []).filter((s) => s.niche === niche);

  return (
    <div className="space-y-2 border-t border-hairline/40 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-semibold text-neutral-400">
          🔎 Trend Scout — Kho ứng viên{' '}
          <span className="text-neutral-600">(tìm video Douyin sắp viral theo keyword)</span>
        </span>
        <span className="text-[11px] text-neutral-500">{open ? '▲ thu gọn' : '▼ mở'}</span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* Điều khiển quét */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bộ lọc CHÍNH: chọn ngách → shortlist bên dưới đổi theo ngách đó. */}
            <select
              value={niche}
              onChange={(e) => {
                setNiche(e.target.value);
                void fetchData({ niche: e.target.value });
              }}
              disabled={busyScan || runningNow}
              className="rounded-lg border border-hairline/60 bg-panel/40 px-2 py-2 text-xs text-neutral-200 focus:border-accent-cyan/50 focus:outline-none disabled:opacity-60"
            >
              {(data?.niches ?? []).map((n) => (
                <option key={n.niche} value={n.niche}>
                  {n.label} ({n.keywordCount} keyword)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void onScan()}
              disabled={busyScan || runningNow || !niche}
              className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-4 py-2 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningNow ? 'Đang quét…' : busyScan ? 'Đang khởi chạy…' : 'Quét Douyin'}
            </button>
            {nicheSnapshots.length > 0 && (
              <select
                value={selectedRun}
                onChange={(e) => {
                  setSelectedRun(e.target.value);
                  void fetchData({ run: e.target.value });
                }}
                className="rounded-lg border border-hairline/60 bg-panel/40 px-2 py-2 text-[11px] text-neutral-300 focus:border-accent-cyan/50 focus:outline-none"
              >
                {nicheSnapshots.map((s) => (
                  <option key={s.runId} value={s.runId}>
                    {s.runId} · {s.candidateCount} ứng viên
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Trạng thái run */}
          {runningNow && (
            <p className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-3 py-2 text-[11px] text-accent-cyan">
              ⏳ Đang quét {runState?.niche ?? '?'} (bắt đầu {fmtTime(runState?.startedAt ?? null)})
              — trình duyệt chạy ngầm, tự cập nhật mỗi 5s. Nút "Tạo job" tạm khóa (chung trình duyệt
              Douyin).
            </p>
          )}
          {runState?.state === 'captcha' && (
            <p className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[11px] text-accent-amber">
              ⛔ Douyin chặn CAPTCHA — chạy{' '}
              <code className="rounded bg-panel/60 px-1">pnpm ent:douyin-login</code> trong terminal
              để giải tay 1 lần, rồi bấm "Quét Douyin" lại. Phần đã quét vẫn được giữ trong
              snapshot.
            </p>
          )}
          {runState?.state === 'failed' && runState.message && (
            <p className="rounded-lg border border-accent-rose/30 bg-accent-rose/5 px-3 py-2 text-[11px] text-accent-rose">
              🛑 {runState.message}
            </p>
          )}
          {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}

          {/* Bảng ứng viên */}
          {selected && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-neutral-600">
                Snapshot <span className="font-semibold text-neutral-400">{selected.runId}</span> ·{' '}
                {selected.keywordsCompleted}/{selected.keywordCount} keyword ·{' '}
                {selected.candidates.length} ứng viên (loại: cũ {selected.rejectedCounts.tooOld} ·
                mới {selected.rejectedCounts.tooNew} · dưới sàn {selected.rejectedCounts.belowFloor}
                ) · điểm = ước lượng likes/phút theo tuổi video
              </p>
              {selected.candidates.length === 0 && (
                <p className="text-[11px] text-neutral-500">
                  Chưa có ứng viên trong cửa sổ 30ph–6h. Thử quét lại vào khung giờ Douyin sôi động
                  hơn hoặc nới keyword trong config/scout.
                </p>
              )}
              {selected.candidates.slice(0, 20).map((c, i) => (
                <div
                  key={c.awemeId}
                  className="flex items-start justify-between gap-2 rounded-lg border border-hairline/50 bg-panel/30 px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-bold text-neutral-300">#{i + 1}</span>
                      <span className="rounded-full bg-accent-cyan/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-cyan">
                        {Math.round(c.score)} điểm
                      </span>
                      <span className="text-neutral-500">
                        {fmtAge(c.ageMinutes)} · {fmtCount(c.diggCount)} likes ·{' '}
                        {Math.round(c.likesPerMinute)} l/ph · {fmtCount(c.commentCount)} cmt
                      </span>
                      {c.signals
                        .filter((s) => SIGNAL_META[s])
                        .map((s) => (
                          <span
                            key={s}
                            className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${SIGNAL_META[s]?.cls}`}
                          >
                            {SIGNAL_META[s]?.label}
                          </span>
                        ))}
                    </p>
                    <p className="truncate text-[11px] text-neutral-300">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-neutral-700 underline-offset-2 hover:text-accent-cyan"
                      >
                        {c.desc || '(không có mô tả)'}
                      </a>
                      {c.authorNickname && (
                        <span className="text-neutral-600"> — {c.authorNickname}</span>
                      )}
                    </p>
                    <p className="truncate text-[10px] text-neutral-600">{c.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onPromote(c)}
                    disabled={c.alreadyJobbed || busyPromote !== null || runningNow}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                      c.alreadyJobbed
                        ? 'cursor-not-allowed border-hairline/40 bg-panel/20 text-neutral-600'
                        : 'border-accent-green/40 bg-accent-green/10 text-accent-green hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    {c.alreadyJobbed
                      ? 'Đã có job'
                      : busyPromote === c.url
                        ? 'Đang tải…'
                        : '➕ Tạo job'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {!selected && !runningNow && (
            <p className="text-[11px] text-neutral-500">
              Chưa có lượt quét nào cho ngách này — bấm "Quét Douyin". Kết quả là bảng video mới
              đăng 30ph–6h có tốc độ tăng like bất thường (tìm trend khi nó mới bắt đầu).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
