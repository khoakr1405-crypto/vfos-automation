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
  startedAt?: string; // dùng cho merge "freshest-wins" (B) — chống run cũ đè run mới
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
interface CoverageSummary {
  detectedMoments: number;
  strongMoments: number;
  usedAnchors: number;
  minRequired: number;
  pass: boolean;
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
  coverage?: CoverageSummary | null;
  render?: RenderSummary | null;
  audio?: AudioSummary | null;
  reviewGates?: { scriptApproved: boolean; previewApproved: boolean };
  storyEngine?: 'story' | 'anchors';
  story?: { confidence?: string; sourceType?: string } | null;
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
  '03c-moneyshot-coverage': 'Kiểm cảnh ăn tiền (coverage)',
  '10-montage-v2': 'Dựng montage + render base',
  '13-source-bound': 'Việt hóa bám gốc (gpt-5.5)',
  '12-voice-render': 'Lồng tiếng + caption + render',
  '15-audio-ambient-full': 'Bỏ giọng Trung + giữ ambient (Demucs)',
};

// Nhãn tiếng Việt cho story metadata (read-only indicator).
const STORY_SOURCE_LABEL: Record<string, string> = {
  story: 'Story',
  highlight: 'Highlight',
  story_split_candidate: 'Story (ghép)',
};
const STORY_CONF_LABEL: Record<string, string> = { high: 'cao', medium: 'vừa', low: 'thấp' };

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function anyRunning(detail: JobDetail | null): boolean {
  if (!detail?.steps) return false;
  return Object.values(detail.steps).some((s) => s.state === 'running');
}

// Chuỗi sub-step CANONICAL của nút "Sản xuất video" — khớp đúng thứ tự
// subsFor('produce') trong scripts/ent-vlog/20-pipeline.ts. Progress line bám
// chuỗi này để 1 job luôn thấy đủ 8 bước (bước chưa chạy = mờ).
const PRODUCE_CHAIN = [
  '02-asr-zh',
  '03b-vision-anchor',
  '03-clip-mine',
  '03c-moneyshot-coverage',
  '10-montage-v2',
  '13-source-bound',
  '12-voice-render',
  '15-audio-ambient-full',
] as const;

type StepVis = 'done' | 'running' | 'failed' | 'pending' | 'awaiting';
interface StepRow {
  key: string;
  label: string;
  vis: StepVis;
  ms?: number;
  gate?: boolean;
}

function rank(state: string): number {
  return state === 'running' ? 3 : state === 'failed' ? 2 : 1; // running > failed > done
}

/** Gom trạng thái sub-step THẬT từ MỌI step file (produce/render/script/…). Khi 1
 *  sub xuất hiện ở nhiều step file, ưu tiên **file mới nhất theo startedAt (B)** —
 *  để run cũ không đè run mới (vd render.json cũ rò "done" sang produce đang chạy).
 *  Cùng độ mới (hoặc thiếu startedAt) thì tie-break theo rank running>failed>done. */
function mergeSubs(detail: JobDetail | null): Map<string, SubStatus> {
  const m = new Map<string, { sub: SubStatus; at: number }>();
  for (const st of Object.values(detail?.steps ?? {})) {
    const at = st.startedAt ? Date.parse(st.startedAt) : 0;
    for (const sub of st.subs) {
      const prev = m.get(sub.name);
      const fresher =
        !prev || at > prev.at || (at === prev.at && rank(sub.state) >= rank(prev.sub.state));
      if (fresher) m.set(sub.name, { sub, at });
    }
  }
  const out = new Map<string, SubStatus>();
  for (const [name, v] of m) out.set(name, v.sub);
  return out;
}

/** Dựng progress line per-step: bám chuỗi canonical, gắn trạng thái runtime thật;
 *  sub chưa chạy = pending (mờ). Thêm node cổng tay "Duyệt video" ở cuối. */
function buildStepRows(
  detail: JobDetail | null,
  renderFinished: boolean,
  previewApproved: boolean,
): StepRow[] {
  const merged = mergeSubs(detail);
  // A: khi CÓ produce.json (chuỗi đầy đủ), progress line bám ĐÚNG run đó — sub nào
  // produce chưa chạy tới = pending (mờ), KHÔNG mượn "done" từ step file khác
  // (render.json đứng riêng). Không có produce.json thì fallback merged (freshest).
  const produce = detail?.steps?.produce;
  const fromProduce = produce ? new Map(produce.subs.map((s) => [s.name, s])) : null;
  const rows: StepRow[] = PRODUCE_CHAIN.map((name) => {
    const e = fromProduce ? fromProduce.get(name) : merged.get(name);
    return {
      key: name,
      label: SUB_LABEL[name] ?? name,
      vis: (e?.state ?? 'pending') as StepVis,
      ms: e?.ms,
    };
  });
  const gateVis: StepVis = previewApproved ? 'done' : renderFinished ? 'awaiting' : 'pending';
  rows.push({ key: 'preview', label: 'Duyệt video (cổng tay)', vis: gateVis, gate: true });
  return rows;
}

/** Lỗi step đầu tiên (failed) để hiện đỏ dưới progress line. */
function firstStepError(detail: JobDetail | null): string | null {
  for (const st of Object.values(detail?.steps ?? {})) {
    if (st.state === 'failed' && st.error) return st.error;
  }
  return null;
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
          if (path.includes('produce') || path.includes('voice-render')) {
            setPreviewTick((t) => t + 1); // cache-bust <video> cho lần render mới
          }
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

  const running = anyRunning(detail);
  const previewApproved = detail?.reviewGates?.previewApproved === true;
  const coverage = detail?.coverage ?? null;
  const render = detail?.render ?? null;
  const audio = detail?.audio ?? null;
  // Video coi là "xong hẳn" khi render KHÔNG còn chạy (cả 12+15 done). Lúc đó mới
  // hiện player + cổng Duyệt video — KHÔNG hiện preview giữa chừng render.
  const renderFinished = !!render && !running;
  const stepRows = buildStepRows(detail, renderFinished, previewApproved);
  const stepError = firstStepError(detail);

  // CỔNG DUY NHẤT = Duyệt video. "Sản xuất video" chạy nguyên chuỗi tới preview
  // (analyze→…→render→audio), KHÔNG dừng duyệt script giữa chừng.
  const onProduce = () =>
    post('/produce', '▶ Đang sản xuất ngầm (analyze → montage → script → voice → audio)…');
  function onApprovePreview() {
    return post('/approve', '✅ Đã duyệt video (GATE 2) — sang "Đăng lên TikTok" (đăng tay).');
  }

  return (
    <div className="space-y-4">
      {/* 1 NÚT "Sản xuất video" — chạy nguyên chuỗi tới Duyệt video */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onProduce}
          disabled={!selectedId || busy || running}
          className="rounded-xl border border-accent-cyan/40 bg-accent-cyan/15 px-5 py-2.5 text-sm font-bold text-accent-cyan transition hover:bg-accent-cyan/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? 'Đang chạy ngầm…' : 'Sản xuất video'}
        </button>
        <p className="text-[11px] text-neutral-600">
          {running
            ? '⏳ Đang chạy ngầm — video chỉ hiện khi render xong hẳn. Rồi bấm "Duyệt video".'
            : '⚠️ Gọi OpenAI + render (tốn phí, vài phút). Chạy nguyên chuỗi analyze → montage → script → voice → audio, dừng ở Duyệt video.'}
        </p>
        {msg && <p className="text-[11px] text-neutral-400">{msg}</p>}
      </div>

      {/* Story engine + phân loại (read-only indicator — KHÔNG toggle/gate) */}
      {detail && <StoryEngineBadge detail={detail} />}

      {/* Progress line per-step — phản ánh runtime THẬT của job:
          đèn pulse = đang chạy · ✓ xanh = xong · mờ = chưa chạy · ✕ đỏ = lỗi. */}
      {detail && <StepProgress rows={stepRows} running={running} error={stepError} />}

      {/* Coverage cảnh ăn tiền (money-shot) — summary nhỏ, chạy ngầm trong sản xuất */}
      {coverage && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11px] ${
            coverage.pass
              ? 'border-accent-green/30 bg-accent-green/5 text-neutral-300'
              : 'border-accent-rose/40 bg-accent-rose/5 text-accent-rose'
          }`}
        >
          🎣 Đã phát hiện <strong>{coverage.detectedMoments}</strong> cảnh ăn tiền (rõ{' '}
          {coverage.strongMoments}), dùng <strong>{coverage.usedAnchors}</strong> cảnh.{' '}
          {coverage.pass ? (
            '✅ Coverage đạt.'
          ) : (
            <strong>
              🛑 Coverage FAIL (&lt; {coverage.minRequired}) — video nghèo cảnh ăn tiền, DỪNG sản
              xuất. Thử nguồn khác.
            </strong>
          )}
        </div>
      )}

      {/* Script đã dịch — CHỈ HIỂN THỊ tham khảo (không còn cổng duyệt script) */}
      {review && renderFinished && <ScriptReviewBlock review={review} />}

      {/* CỔNG DUY NHẤT — QA + audio policy + player + nút "Duyệt video".
          Chỉ hiện khi render XONG HẲN (renderFinished) — không hiện lúc đang render. */}
      {renderFinished && render && (
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

/** Đèn trạng thái 1 bước: ✓ xanh (done) · pulse cyan (running) · pulse amber
 *  (awaiting = chờ duyệt) · ✕ đỏ (failed) · viền mờ (pending). */
function StepDot({ vis }: { vis: StepVis }) {
  const base =
    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none';
  if (vis === 'done') return <span className={`${base} bg-accent-green/90 text-black`}>✓</span>;
  if (vis === 'failed') return <span className={`${base} bg-accent-rose text-white`}>✕</span>;
  if (vis === 'running')
    return (
      <span
        className={`${base} animate-pulse bg-accent-cyan text-black ring-2 ring-accent-cyan/30`}
      />
    );
  if (vis === 'awaiting')
    return (
      <span
        className={`${base} animate-pulse bg-accent-amber text-black ring-2 ring-accent-amber/30`}
      />
    );
  return <span className={`${base} border border-neutral-700 bg-transparent`} />;
}

function stepLabelClass(vis: StepVis): string {
  if (vis === 'done') return 'text-neutral-300';
  if (vis === 'running') return 'font-semibold text-accent-cyan';
  if (vis === 'failed') return 'font-semibold text-accent-rose';
  if (vis === 'awaiting') return 'font-semibold text-accent-amber';
  return 'text-neutral-600'; // pending = mờ
}

/** Progress line per-step real-time: mỗi bước 1 dòng đèn trạng thái, bám runtime
 *  thật của job (không còn "đang chạy chung chung"). */
function StepProgress({
  rows,
  running,
  error,
}: {
  rows: StepRow[];
  running: boolean;
  error?: string | null;
}) {
  const done = rows.filter((r) => r.vis === 'done' && !r.gate).length;
  const total = rows.filter((r) => !r.gate).length;
  return (
    <div className="space-y-2 rounded-lg border border-hairline/50 bg-panel/30 px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-neutral-400">
          Tiến trình theo bước (real-time)
        </p>
        <span className="text-[10px] text-neutral-600">
          {running ? '⏳ đang chạy ngầm' : `${done}/${total} bước`}
        </span>
      </div>
      <ol className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5 text-[11px]">
            <StepDot vis={r.vis} />
            <span className={stepLabelClass(r.vis)}>{r.label}</span>
            {r.ms != null && (r.vis === 'done' || r.vis === 'running') && (
              <span className="text-[10px] text-neutral-600">{(r.ms / 1000).toFixed(0)}s</span>
            )}
            {r.vis === 'running' && !r.gate && (
              <span className="text-[10px] text-accent-cyan">đang chạy…</span>
            )}
            {r.vis === 'awaiting' && (
              <span className="text-[10px] text-accent-amber">chờ Operator duyệt</span>
            )}
          </li>
        ))}
      </ol>
      {error && <p className="text-[10px] text-accent-rose">🛑 {error}</p>}
    </div>
  );
}

/** Read-only indicator: engine montage (story/anchors) + phân loại story
 *  (sourceType/confidence) từ story_arc.json. CHỈ hiển thị — KHÔNG toggle, KHÔNG
 *  gate, KHÔNG tô đỏ. Thiếu storyEngine → mặc định 'story' (khớp server defensive). */
function StoryEngineBadge({ detail }: { detail: JobDetail }) {
  const engineAnchors = detail.storyEngine === 'anchors';
  const story = detail.story ?? null;
  const chip = 'rounded-full px-2 py-0.5 text-[10px] font-semibold';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={
          engineAnchors
            ? `${chip} bg-panel/60 text-neutral-300`
            : `${chip} border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan`
        }
      >
        Engine: {engineAnchors ? 'Anchors' : 'Story'}
      </span>
      {story ? (
        <>
          {story.sourceType && (
            <span className={`${chip} bg-panel/60 text-neutral-300`}>
              Phân loại: {STORY_SOURCE_LABEL[story.sourceType] ?? story.sourceType}
            </span>
          )}
          {story.confidence && (
            <span className={`${chip} bg-panel/60 text-neutral-300`}>
              Độ tin: {STORY_CONF_LABEL[story.confidence] ?? story.confidence}
            </span>
          )}
        </>
      ) : (
        <span className={`${chip} bg-panel/40 text-neutral-600`}>Chưa phân loại</span>
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

      {/* Audio policy: đã áp thật / lỗi (render đã xong nên không còn trạng thái "đang chạy") */}
      {audioApplied ? (
        <div className="rounded-lg border border-accent-cyan/20 bg-panel/30 px-3 py-2 text-[11px] text-neutral-400">
          <p className="font-semibold text-neutral-300">🔊 Audio policy: {audio?.audioMode} ✅</p>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            <span>Demucs: {audio?.demucs}</span>
            <span>ambient level: {audio?.ambientLevel ?? '?'}</span>
            <span>BGM: {audio?.bgm ?? 'none'}</span>
            <span>giọng Trung tách (đỉnh): {audio?.vocalsRemovedMaxDb ?? '?'}dB</span>
            <span>ambient giữ (đỉnh): {audio?.ambientKeptMaxDb ?? '?'}dB</span>
            <span>
              VO &gt; ambient: {audio?.voiceAboveAmbientDb ?? '?'}dB{' '}
              {(audio?.voiceAboveAmbientDb ?? 0) > 0 ? '✅' : '⚠️'}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            Giữ tiếng biển/gió/nước/quẫy, bỏ lời người Trung. Tai Operator xác nhận cuối.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-[11px] text-accent-amber">
          ⚠️ Render xong nhưng audio policy remove_speech_keep_ambient CHƯA áp (Demucs lỗi). KHÔNG
          hiện video chưa bỏ giọng Trung. Bấm "Sản xuất video" để chạy lại.
        </div>
      )}

      {/* Player — CHỈ hiện bản đã áp audio policy thật (không hiện bản còn giọng Trung) */}
      {audioApplied && render.previewReady && (
        // biome-ignore lint/a11y/useMediaCaption: caption đã bake vào video (kinetic caption)
        <video
          key={previewTick}
          controls
          className="w-full max-w-[280px] rounded-lg border border-hairline/40"
          src={`/api/studio/entertainment/jobs/${jobId}/preview?t=${previewTick}`}
        />
      )}

      {/* Nút "Duyệt video" — NẰM DƯỚI VIDEO (cổng tay duy nhất) */}
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
            : '🔒 Audio policy chưa áp thật — bấm "Sản xuất video" chạy lại.'}
        </span>
      </div>
    </div>
  );
}

function ScriptReviewBlock({ review }: { review: ScriptReview }) {
  const s = review.summary;
  const chunkOk = (s.chunkCount ?? 0) >= 40 && (s.chunkCount ?? 0) <= 55;
  const speechOk = (s.estTotalSpeechSec ?? 0) < (s.montageTotalSec ?? 0);
  return (
    <div className="space-y-3 rounded-xl border border-hairline/50 bg-panel/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-100">📝 Script đã dịch (tham khảo)</h3>
        <span className="rounded-full bg-panel/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-400">
          {s.scriptModel ?? '?'}
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
              <p key={`${l.sceneIdx}-${l.id}-${l.mStart}`}>
                [{mmss(l.mStart)}] (id{l.id}) {l.zh}
              </p>
            ))}
          </div>
        </details>
      )}

      <p className="border-t border-hairline/30 pt-2 text-[10px] text-neutral-600">
        Bản dịch tiếng Việt (gpt-5.5) bám lời gốc — chỉ để tham khảo, không còn cổng duyệt riêng.
        Muốn GIỮ bản sửa tay? Edit <code>montage_v2_script.json</code> rồi đặt{' '}
        <code>reviewStatus: "OPERATOR_EDITED"</code> — bấm "Sản xuất video" sẽ giữ nguyên script đã
        sửa (chỉ render lại). Bấm "Sản xuất video" khi script còn <code>"AUTO"</code> sẽ sinh lại từ
        đầu (ghi đè).
      </p>
    </div>
  );
}
