'use client';

/* =============================================================================
 * VFOS Studio — Entertainment production panel (E-UI-3) — CLIENT island
 * -----------------------------------------------------------------------------
 * Nút "Sản xuất video" chạy chuỗi analyze → montage → script (DETACHED), poll
 * tiến trình, rồi render BẢNG DUYỆT SCRIPT (bám lời gốc) + GATE 1 "Duyệt script".
 * DỪNG trước voice/render (E-UI-4). Không publish, không TikTok API.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';

interface SubStatus {
  name: string;
  state: 'running' | 'done' | 'failed';
  ms?: number;
}
interface StepStatus {
  step: string;
  state: 'idle' | 'running' | 'done' | 'failed';
  subs: SubStatus[];
  error?: string;
}
interface ScriptSummary {
  reviewStatus: string;
  scriptModel?: string;
  chunkCount?: number;
  boundChunks?: number;
  microChunks?: number;
  estTotalSpeechSec?: number;
  montageTotalSec?: number;
}
interface JobDetail {
  jobId: string;
  state: string;
  source: { url: string; durationSec?: number };
  steps?: Record<string, StepStatus>;
  script?: ScriptSummary | null;
  reviewGates?: { scriptApproved: boolean; previewApproved: boolean };
}
interface ScriptBeat {
  role: string;
  text: string;
  montageTime: number;
  estSec: number;
  srcId?: number;
}
interface ScriptReview {
  summary: ScriptSummary;
  beats: ScriptBeat[];
  sourceLines: Array<{ id: number; sceneIdx: number; zh: string; mStart: number }>;
  reviewMd: string | null;
  approved: boolean;
}
interface JobListItem {
  jobId: string;
  state: string;
  source: { url: string };
}

const SUB_LABEL: Record<string, string> = {
  '02-asr-zh': 'Bóc lời gốc (ASR Trung)',
  '03b-vision-anchor': 'Vision tìm "cá/mực lên"',
  '03-clip-mine': 'Chọn clip hay',
  '10-montage-v2': 'Dựng montage + render base',
  '13-source-bound': 'Việt hóa bám gốc (gpt-5.5)',
};

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function subIcon(state: string): string {
  if (state === 'done') return '✅';
  if (state === 'running') return '⏳';
  if (state === 'failed') return '🛑';
  return '·';
}

function anyRunning(detail: JobDetail | null): boolean {
  if (!detail?.steps) return false;
  return Object.values(detail.steps).some((s) => s.state === 'running');
}

/** Step đang/đã chạy gần nhất để hiển thị tiến trình (produce ưu tiên). */
function activeStep(detail: JobDetail | null): StepStatus | null {
  const steps = detail?.steps;
  if (!steps) return null;
  return steps.produce ?? steps.script ?? steps.montage ?? steps.analyze ?? null;
}

export function ProductionPanel() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [review, setReview] = useState<ScriptReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/entertainment/jobs');
      const j = (await r.json()) as { ok: boolean; jobs?: JobListItem[] };
      if (j.ok && j.jobs) {
        setJobs(j.jobs);
        setSelectedId((cur) => cur || j.jobs?.[0]?.jobId || '');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadReview = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${id}/script`);
      if (!r.ok) {
        setReview(null);
        return;
      }
      const j = (await r.json()) as { ok: boolean; review?: ScriptReview };
      setReview(j.ok && j.review ? j.review : null);
    } catch {
      setReview(null);
    }
  }, []);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const r = await fetch(`/api/studio/entertainment/jobs/${id}`);
        const j = (await r.json()) as { ok: boolean; job?: JobDetail };
        if (j.ok && j.job) {
          setDetail(j.job);
          if (j.job.script) void loadReview(id);
          else setReview(null);
        }
      } catch {
        /* ignore */
      }
    },
    [loadReview],
  );

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Đổi job chọn → tải detail.
  useEffect(() => {
    setReview(null);
    setDetail(null);
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Poll khi có step đang chạy.
  useEffect(() => {
    const live = anyRunning(detail);
    if (live && selectedId && !pollRef.current) {
      pollRef.current = setInterval(() => void loadDetail(selectedId), 3000);
    }
    if (!live && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [detail, selectedId, loadDetail]);

  async function post(path: string, okMsg: string) {
    if (!selectedId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}${path}`, {
        method: 'POST',
      });
      const j = (await r.json()) as { ok: boolean; message?: string; code?: string };
      setMsg(j.ok ? okMsg : `🛑 ${j.message ?? j.code ?? 'Lỗi.'}`);
      await loadDetail(selectedId);
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
    } finally {
      setBusy(false);
    }
  }

  const step = activeStep(detail);
  const running = anyRunning(detail);
  const approved = detail?.reviewGates?.scriptApproved === true;
  const hasScript = !!detail?.script;

  return (
    <div className="space-y-4">
      {/* Chọn job */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-500">Job:</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={busy || running}
          className="rounded-lg border border-hairline/60 bg-panel/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-accent-cyan/50 focus:outline-none disabled:opacity-60"
        >
          {jobs.length === 0 && <option value="">— chưa có job (tải link trước) —</option>}
          {jobs.map((j) => (
            <option key={j.jobId} value={j.jobId}>
              {j.jobId} · {j.state}
            </option>
          ))}
        </select>
        {detail && (
          <span className="rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
            {detail.state}
          </span>
        )}
      </div>

      {/* Nút sản xuất */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => post('/produce', '▶ Đã khởi chạy sản xuất tới bước duyệt script…')}
            disabled={!selectedId || busy || running}
            className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Đang sản xuất…' : 'Sản xuất video (đến duyệt script)'}
          </button>
          {hasScript && !running && (
            <button
              type="button"
              onClick={() => post('/script', '▶ Chạy lại bước script…')}
              disabled={busy}
              className="rounded-lg border border-hairline/60 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:bg-panel/60 disabled:opacity-50"
            >
              Chạy lại script
            </button>
          )}
        </div>
        <p className="text-[11px] text-neutral-600">
          ⚠️ Gọi OpenAI (Whisper + gpt-4o vision + gpt-5.5) và render ~vài phút — tốn phí. Chuỗi DỪNG
          ở bước duyệt script, chưa voice/đăng.
        </p>
        {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}
      </div>

      {/* Tiến trình step */}
      {step && (
        <div className="space-y-1.5 rounded-lg border border-hairline/50 bg-panel/30 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-neutral-400">
            Tiến trình: {step.step} · {step.state}
          </p>
          {step.subs.length === 0 && step.state === 'running' && (
            <p className="text-[10px] text-neutral-500">Đang khởi động…</p>
          )}
          {step.subs.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-[10px] text-neutral-400">
              <span>{subIcon(s.state)}</span>
              <span>{SUB_LABEL[s.name] ?? s.name}</span>
              {s.ms != null && (
                <span className="text-neutral-600">{(s.ms / 1000).toFixed(0)}s</span>
              )}
            </div>
          ))}
          {step.error && <p className="text-[10px] text-accent-rose">🛑 {step.error}</p>}
        </div>
      )}

      {/* Script review + GATE 1 */}
      {review && (
        <ScriptReviewBlock
          review={review}
          approved={approved}
          busy={busy}
          onApprove={() =>
            post('/script/approve', '✅ Đã duyệt script (GATE 1). Voice/render: E-UI-4.')
          }
        />
      )}
    </div>
  );
}

function ScriptReviewBlock({
  review,
  approved,
  busy,
  onApprove,
}: {
  review: ScriptReview;
  approved: boolean;
  busy: boolean;
  onApprove: () => void;
}) {
  const s = review.summary;
  const chunkOk = (s.chunkCount ?? 0) >= 40 && (s.chunkCount ?? 0) <= 55;
  const speechOk = (s.estTotalSpeechSec ?? 0) < (s.montageTotalSec ?? 0);
  return (
    <div className="space-y-3 rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-100">
          ⛔ GATE 1 — Duyệt script (bám lời gốc)
        </h3>
        <span className="rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
          {s.scriptModel ?? 'model?'}
        </span>
      </div>

      {/* QA summary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
        <span>
          Cụm: <strong className="text-neutral-200">{s.chunkCount ?? '?'}</strong>{' '}
          {chunkOk ? '✅' : '⚠️'} (bound {s.boundChunks ?? '?'}/micro {s.microChunks ?? '?'})
        </span>
        <span>
          Đọc ~{s.estTotalSpeechSec ?? '?'}s / {s.montageTotalSec ?? '?'}s {speechOk ? '✅' : '⚠️'}
        </span>
      </div>

      {/* Việt hóa theo timecode */}
      <div className="max-h-72 overflow-auto rounded-lg border border-hairline/40 bg-panel/30">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-panel/80 text-neutral-500">
            <tr>
              <th className="px-2 py-1 font-semibold">#</th>
              <th className="px-2 py-1 font-semibold">time</th>
              <th className="px-2 py-1 font-semibold">text (caption = voice)</th>
              <th className="px-2 py-1 font-semibold">nguồn</th>
            </tr>
          </thead>
          <tbody>
            {review.beats.map((b, i) => (
              <tr key={`${b.montageTime}-${i}`} className="border-t border-hairline/20">
                <td className="px-2 py-1 text-neutral-600">{i + 1}</td>
                <td className="px-2 py-1 text-neutral-500">{mmss(b.montageTime)}</td>
                <td className="px-2 py-1 text-neutral-200">{b.text}</td>
                <td className="px-2 py-1 text-neutral-600">
                  {b.role === 'micro' ? (
                    <span className="text-accent-cyan">micro</span>
                  ) : (
                    `id${b.srcId ?? '?'}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lời gốc đối chiếu */}
      {review.sourceLines.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold text-neutral-400">
            Lời gốc (ASR Trung) đã cắt theo montage time
          </summary>
          <div className="mt-1.5 max-h-44 space-y-0.5 overflow-auto rounded-lg border border-hairline/30 bg-panel/20 p-2 text-[10px] text-neutral-500">
            {review.sourceLines.map((l) => (
              <p key={l.id}>
                [{mmss(l.mStart)}] (id{l.id}) {l.zh}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* GATE action */}
      <div className="flex items-center gap-3 border-t border-accent-amber/20 pt-3">
        {approved ? (
          <span className="rounded-lg bg-accent-green/15 px-3 py-2 text-xs font-bold text-accent-green">
            ✅ Script đã duyệt — voice/render mở ở E-UI-4
          </span>
        ) : (
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="rounded-xl border border-accent-amber/50 bg-accent-amber/15 px-5 py-2.5 text-sm font-bold text-accent-amber transition hover:bg-accent-amber/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Duyệt script (mở khóa voice)
          </button>
        )}
        <span className="text-[10px] text-neutral-600">
          Sửa text? Edit montage_v2_script.json rồi bấm "Chạy lại script".
        </span>
      </div>
    </div>
  );
}
