'use client';

/* =============================================================================
 * VFOS Studio — Entertainment production panel (E-UI-7 gom nút) — CLIENT island
 * -----------------------------------------------------------------------------
 * CHỈ 2 NÚT cho cả phần "Sản xuất video":
 *   1) "Sản xuất video" → chạy NGẦM analyze→montage→script, dừng ở GATE 1.
 *      (sau khi có render thì nút này đổi ngữ cảnh thành "Render lại")
 *   2) "Duyệt" (1 nút đổi ngữ cảnh cho 2 cổng): lần 1 = duyệt script rồi TỰ
 *      chạy ngầm voice+render+audio policy → dừng GATE 2; lần 2 = duyệt video.
 * Mọi sub-step (Whisper, vision, gpt-5.5, edge-tts, Demucs) chạy ngầm; phần còn
 * lại chỉ HIỂN THỊ (tiến trình, tóm tắt script, QA, audio policy, player).
 * 2 GATE duyệt tay GIỮ NGUYÊN (luật an toàn). KHÔNG auto-publish, không TikTok API.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEntLane } from './ent-lane-context';

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
interface RenderSummary {
  verdict: string;
  hashMatch: boolean;
  captionOverlap: number;
  captionTightButReadable?: number;
  realVoiceEndSec?: number;
  montageTotalSec?: number;
  outputDurationSec?: number;
  voiceSpillMoneyShot: number;
  voiceMarginDb?: number;
  bgmDrownsVoice?: boolean;
  bgm?: string | null;
  scrubMaskSegments?: number;
  previewReady: boolean;
}
interface AudioSummary {
  audioMode: string;
  demucs: string;
  ambientLevel?: number;
  bgm?: string | null;
  fallbackUsed?: string | null;
  voiceAboveAmbientDb?: number;
  ambientKeptMaxDb?: number;
  vocalsRemovedMaxDb?: number;
  applied: boolean;
}
interface JobDetail {
  jobId: string;
  state: string;
  source: { url: string; durationSec?: number };
  steps?: Record<string, StepStatus>;
  script?: ScriptSummary | null;
  render?: RenderSummary | null;
  audio?: AudioSummary | null;
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

const SUB_LABEL: Record<string, string> = {
  '02-asr-zh': 'Bóc lời gốc (ASR Trung)',
  '03b-vision-anchor': 'Vision tìm "cá/mực lên"',
  '03-clip-mine': 'Chọn clip hay',
  '10-montage-v2': 'Dựng montage + render base',
  '13-source-bound': 'Việt hóa bám gốc (gpt-5.5)',
  '12-voice-render': 'Lồng tiếng + caption + render',
  '15-audio-ambient-full': 'Bỏ giọng Trung + giữ ambient (Demucs)',
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

/** Step đang/đã chạy gần nhất để hiển thị tiến trình (render mới nhất → produce). */
function activeStep(detail: JobDetail | null): StepStatus | null {
  const steps = detail?.steps;
  if (!steps) return null;
  return steps.render ?? steps.produce ?? steps.script ?? steps.montage ?? steps.analyze ?? null;
}

export function ProductionPanel() {
  const { selectedId, refreshJobs } = useEntLane();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [review, setReview] = useState<ScriptReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewTick, setPreviewTick] = useState(0); // cache-bust <video> sau re-render
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Đổi job chọn (từ context) → tải detail.
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

  const post = useCallback(
    async (path: string, okMsg: string): Promise<boolean> => {
      if (!selectedId || busy) return false;
      setBusy(true);
      setMsg(null);
      try {
        const r = await fetch(`/api/studio/entertainment/jobs/${selectedId}${path}`, {
          method: 'POST',
        });
        const j = (await r.json()) as { ok: boolean; message?: string; code?: string };
        if (j.ok) {
          setMsg(okMsg);
          if (path.includes('voice-render')) setPreviewTick((t) => t + 1);
        } else {
          setMsg(`🛑 ${j.message ?? j.code ?? 'Lỗi.'}`);
        }
        await loadDetail(selectedId);
        await refreshJobs();
        return j.ok;
      } catch (e) {
        setMsg(`🛑 ${e instanceof Error ? e.message : 'Lỗi mạng.'}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [selectedId, busy, loadDetail, refreshJobs],
  );

  const step = activeStep(detail);
  const running = anyRunning(detail);
  const approved = detail?.reviewGates?.scriptApproved === true;
  const previewApproved = detail?.reviewGates?.previewApproved === true;
  const hasScript = !!detail?.script;
  const render = detail?.render ?? null;
  const audio = detail?.audio ?? null;

  // Nút chính LUÔN "Sản xuất video" — KHÔNG có khái niệm "render lại". Render là
  // một phần của sản xuất, tự chạy ngầm sau khi duyệt script. Kết quả chỉ có:
  // hoàn thành, hoặc lỗi (báo lỗi ở khối tiến trình). Nếu lỡ dừng sau duyệt
  // script mà chưa render, bấm "Sản xuất video" sẽ tiếp tục phần còn lại.
  const produceRun =
    approved && !render
      ? () => post('/voice-render', '▶ Đang sản xuất ngầm (lồng tiếng + giữ ambient)…')
      : () => post('/produce', '▶ Đang sản xuất ngầm tới bước duyệt script…');

  const scriptPending = hasScript && !approved && !running;
  async function onApproveScript() {
    const ok = await post('/script/approve', '✅ Đã duyệt script — đang tự sản xuất ngầm…');
    if (ok)
      await post(
        '/voice-render',
        '▶ Đang sản xuất ngầm (lồng tiếng + bỏ giọng Trung/giữ ambient)…',
      );
  }
  function onApprovePreview() {
    return post('/approve', '✅ Đã duyệt video (GATE 2) — sang "Đăng lên TikTok" (đăng tay).');
  }

  return (
    <div className="space-y-4">
      {/* 1 NÚT "Sản xuất video" — render là phần của sản xuất, tự chạy ngầm */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={produceRun}
          disabled={!selectedId || busy || running}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Đang chạy ngầm…' : 'Sản xuất video'}
        </button>
        <p className="text-[11px] text-neutral-600">
          {running
            ? '⏳ Đang chạy ngầm — chờ tự dừng ở cổng duyệt tiếp theo.'
            : '⚠️ Gọi OpenAI + render (tốn phí, vài phút). Chạy ngầm analyze → montage → script → voice → audio, dừng ở các cổng duyệt.'}
        </p>
        {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}
      </div>

      {/* Tiến trình step (hiển thị) */}
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

      {/* GATE 1 — tóm tắt script + nút "Duyệt script" ở cuối block */}
      {review && (
        <ScriptReviewBlock
          review={review}
          approved={approved}
          busy={busy}
          canApprove={scriptPending}
          onApprove={onApproveScript}
        />
      )}

      {/* GATE 2 — QA + audio policy + player + nút "Duyệt video" DƯỚI video */}
      {approved && render && (
        <VoiceRenderView
          jobId={selectedId}
          render={render}
          audio={audio}
          previewApproved={previewApproved}
          previewTick={previewTick}
          busy={busy}
          onApprove={onApprovePreview}
        />
      )}
    </div>
  );
}

function VoiceRenderView({
  jobId,
  render,
  audio,
  previewApproved,
  previewTick,
  busy,
  onApprove,
}: {
  jobId: string;
  render: RenderSummary;
  audio: AudioSummary | null;
  previewApproved: boolean;
  previewTick: number;
  busy: boolean;
  onApprove: () => void;
}) {
  const pass = render.verdict === 'PASS';
  const audioApplied = audio?.applied === true; // E-UI-5: phải áp THẬT mới cho duyệt
  return (
    <div className="space-y-3 rounded-xl border border-accent-cyan/25 bg-accent-cyan/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-100">🎙️ Voice + Render → Preview</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            previewApproved
              ? 'bg-accent-green/15 text-accent-green'
              : 'bg-accent-amber/15 text-accent-amber'
          }`}
        >
          {previewApproved ? '✅ GATE 2 đã duyệt' : '⏳ Chờ duyệt video (bấm "Duyệt video")'}
        </span>
      </div>

      {/* QA verdict */}
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] ${
          pass
            ? 'border-accent-green/30 bg-accent-green/5 text-accent-green'
            : 'border-accent-rose/30 bg-accent-rose/5 text-accent-rose'
        }`}
      >
        <strong>VERDICT: {render.verdict}</strong>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-neutral-400 sm:grid-cols-3">
        <span>hash voice==caption: {render.hashMatch ? '✅' : '🛑'}</span>
        <span>
          caption chồng lấn: {render.captionOverlap === 0 ? '0 ✅' : `${render.captionOverlap} 🛑`}
        </span>
        <span>
          voice tràn money-shot:{' '}
          {render.voiceSpillMoneyShot === 0 ? '0 ✅' : `${render.voiceSpillMoneyShot} 🛑`}
        </span>
        <span>
          voice end: {render.realVoiceEndSec ?? '?'}s / {render.montageTotalSec ?? '?'}s{' '}
          {(render.realVoiceEndSec ?? 0) <= (render.montageTotalSec ?? 0) ? '✅' : '🛑'}
        </span>
        <span>
          BGM margin: {render.voiceMarginDb ?? '?'}dB {render.bgmDrownsVoice ? '🛑 át' : '✅'}
        </span>
        <span>
          scrub: {render.scrubMaskSegments ?? '?'} vùng · BGM {render.bgm ?? '—'}
        </span>
      </div>

      {/* Audio policy đã chốt */}
      {audio?.applied ? (
        <div className="rounded-lg border border-accent-cyan/20 bg-panel/30 px-3 py-2 text-[11px] text-neutral-400">
          <p className="font-semibold text-neutral-300">🔊 Audio policy: {audio.audioMode} ✅</p>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            <span>Demucs: {audio.demucs}</span>
            <span>ambient level: {audio.ambientLevel ?? '?'}</span>
            <span>BGM: {audio.bgm ?? 'none'}</span>
            <span>giọng Trung tách (đỉnh): {audio.vocalsRemovedMaxDb ?? '?'}dB</span>
            <span>ambient giữ (đỉnh): {audio.ambientKeptMaxDb ?? '?'}dB</span>
            <span>
              VO &gt; ambient: {audio.voiceAboveAmbientDb ?? '?'}dB{' '}
              {(audio.voiceAboveAmbientDb ?? 0) > 0 ? '✅' : '⚠️'}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            Giữ tiếng biển/gió/nước/quẫy, bỏ lời người Trung. Tai Operator xác nhận cuối.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[11px] text-accent-amber">
          ⚠️ Audio policy remove_speech_keep_ambient CHƯA áp (Demucs chưa chạy / lỗi). Bấm "Sản xuất
          video" để chạy lại phần audio.
        </div>
      )}

      {/* Player */}
      {render.previewReady ? (
        // biome-ignore lint/a11y/useMediaCaption: caption đã bake vào video (kinetic caption)
        <video
          key={previewTick}
          controls
          className="w-full max-w-[280px] rounded-lg border border-hairline/40"
          src={`/api/studio/entertainment/jobs/${jobId}/preview?t=${previewTick}`}
        />
      ) : (
        <p className="text-[11px] text-accent-rose">🛑 Chưa có file preview.</p>
      )}

      {/* Nút "Duyệt video" — NẰM DƯỚI VIDEO (cạnh thứ nó duyệt) */}
      <div className="flex flex-wrap items-center gap-3 border-t border-accent-cyan/20 pt-3">
        {previewApproved ? (
          <span className="rounded-lg bg-accent-green/15 px-3 py-2 text-xs font-bold text-accent-green">
            ✅ Đã duyệt video (GATE 2) — sang "Đăng lên TikTok" (đăng tay)
          </span>
        ) : (
          <button
            type="button"
            onClick={onApprove}
            disabled={busy || !audioApplied}
            className="rounded-xl border border-accent-green/50 bg-accent-green/15 px-5 py-2.5 text-sm font-bold text-accent-green transition hover:bg-accent-green/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⛔ Duyệt video
          </button>
        )}
        <span className="text-[10px] text-neutral-600">
          {audioApplied
            ? 'Xem xong, ưng thì bấm "Duyệt video". READY ≠ được đăng — vẫn đăng tay thủ công.'
            : '🔒 Khóa duyệt: audio policy chưa áp thật (chưa bỏ giọng Trung). Bấm "Sản xuất video" render lại.'}
        </span>
      </div>
    </div>
  );
}

function ScriptReviewBlock({
  review,
  approved,
  busy,
  canApprove,
  onApprove,
}: {
  review: ScriptReview;
  approved: boolean;
  busy: boolean;
  canApprove: boolean;
  onApprove: () => void;
}) {
  const s = review.summary;
  const chunkOk = (s.chunkCount ?? 0) >= 40 && (s.chunkCount ?? 0) <= 55;
  const speechOk = (s.estTotalSpeechSec ?? 0) < (s.montageTotalSec ?? 0);
  return (
    <div className="space-y-3 rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-100">⛔ GATE 1 — Script (bám lời gốc)</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            approved
              ? 'bg-accent-green/15 text-accent-green'
              : 'bg-accent-amber/15 text-accent-amber'
          }`}
        >
          {approved ? '✅ Đã duyệt' : '⏳ Chờ duyệt (bấm "Duyệt script")'}
        </span>
      </div>

      {/* QA summary (LUÔN hiện) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
        <span>
          Cụm: <strong className="text-neutral-200">{s.chunkCount ?? '?'}</strong>{' '}
          {chunkOk ? '✅' : '⚠️'} (bound {s.boundChunks ?? '?'}/micro {s.microChunks ?? '?'})
        </span>
        <span>
          Đọc ~{s.estTotalSpeechSec ?? '?'}s / {s.montageTotalSec ?? '?'}s {speechOk ? '✅' : '⚠️'}
        </span>
        <span>
          Model: <strong className="text-neutral-200">{s.scriptModel ?? '?'}</strong>
        </span>
      </div>

      {/* Chi tiết script nâng cao — accordion, MẶC ĐỊNH ĐÓNG */}
      <details className="group rounded-lg border border-hairline/40 bg-panel/20">
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[11px] font-semibold text-neutral-300">
          <span>Chi tiết script nâng cao ({review.beats.length} cụm) — bấm để xem</span>
          <span className="text-neutral-600 transition group-open:rotate-90">›</span>
        </summary>
        <div className="border-t border-hairline/30 p-2">
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
        </div>
      </details>

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

      {/* Nút "Duyệt script" — ở cuối block, hệ thống TỰ sản xuất tiếp ngầm */}
      <div className="flex flex-wrap items-center gap-3 border-t border-accent-amber/20 pt-3">
        {approved ? (
          <span className="rounded-lg bg-accent-green/15 px-3 py-2 text-xs font-bold text-accent-green">
            ✅ Đã duyệt script — đang/đã tự sản xuất ngầm
          </span>
        ) : (
          <button
            type="button"
            onClick={onApprove}
            disabled={busy || !canApprove}
            className="rounded-xl border border-accent-amber/50 bg-accent-amber/15 px-5 py-2.5 text-sm font-bold text-accent-amber transition hover:bg-accent-amber/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⛔ Duyệt script
          </button>
        )}
        <span className="text-[10px] text-neutral-600">
          Ưng thì bấm "Duyệt script" — hệ thống TỰ sản xuất tiếp ngầm. Sửa text? Edit
          montage_v2_script.json rồi bấm "Sản xuất video".
        </span>
      </div>
    </div>
  );
}
