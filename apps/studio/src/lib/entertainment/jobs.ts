/* =============================================================================
 * VFOS Studio — Entertainment lane job store (E-UI-2) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * Manifest IO + intake orchestration cho lane Giải trí/Vlog Câu cá. Tách HẲN
 * khỏi Product Review: ghi vào namespace runtime riêng data/temp/ent/<id>/,
 * KHÔNG đụng Product Card / Shopee / publish / review registry.
 * Manifest schema theo docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md (§4).
 * Chỉ import từ route handlers dưới app/api/studio/entertainment/*.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript, runRepoScriptDetached } from '@/lib/studio-data/run-command';

const ENT_DIR_REL = 'data/temp/ent';
const FETCH_SCRIPT_REL = 'scripts/ent-vlog/01-fetch-source.ts';
const PIPELINE_SCRIPT_REL = 'scripts/ent-vlog/20-pipeline.ts';
const PACKAGE_SCRIPT_REL = 'scripts/ent-vlog/16-package.ts';
const FETCH_TIMEOUT_MS = 240_000; // download có thể vài chục giây
const PACKAGE_TIMEOUT_MS = 150_000; // caption gpt-5.5 (reasoning) có thể chậm
const SCRIPT_MODEL = 'gpt-5.5'; // source-bound transcreation (13-source-bound)
const NICHES = new Set(['fishing-vlog', 'car-vlog']);

export type EntJobState =
  | 'INTAKE_RUNNING'
  | 'INTAKE_DONE'
  | 'INTAKE_FAILED'
  | 'ANALYZED'
  | 'MONTAGE_READY'
  | 'SCRIPT_PENDING'
  | 'SCRIPT_APPROVED'
  | 'PREVIEW_PENDING'
  | 'APPROVED'
  | 'PACKAGED';

/** Logical pipeline steps the UI can trigger (engine 20-pipeline.ts).
 * render = voice/caption (12) + audio policy remove_speech_keep_ambient (15). */
export type EntStepName = 'analyze' | 'montage' | 'script' | 'produce' | 'render';
export type EntStepState = 'idle' | 'running' | 'done' | 'failed';

export interface EntSubStatus {
  name: string;
  state: 'running' | 'done' | 'failed';
  exitCode?: number | null;
  ms?: number;
}
export interface EntStepStatus {
  step: EntStepName;
  state: EntStepState;
  pid?: number;
  startedAt?: string;
  finishedAt?: string;
  subs: EntSubStatus[];
  error?: string;
}

export interface EntSource {
  url: string;
  type: 'douyin' | 'tiktok' | 'url' | 'local';
  path?: string;
  durationSec?: number;
  width?: number | null;
  height?: number | null;
  fps?: number;
  hasAudio?: boolean;
}

export interface EntScriptSummary {
  ref: string;
  reviewStatus: string;
  scriptModel?: string;
  sourceBound?: boolean;
  chunkCount?: number;
  boundChunks?: number;
  microChunks?: number;
  estTotalSpeechSec?: number;
  montageTotalSec?: number;
}

/** Tóm tắt QA của voice-render (12-voice-render → montage_v2_render_report.json). */
export interface EntRenderSummary {
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

/** Audio policy đã áp (15-audio-ambient-full → montage_v2_audio_report.json). */
export interface EntAudioSummary {
  audioMode: string;
  demucs: string;
  ambientLevel?: number;
  ducking?: string;
  bgm?: string | null;
  fallbackUsed?: string | null;
  voiceAboveAmbientDb?: number;
  ambientKeptMaxDb?: number;
  vocalsRemovedMaxDb?: number;
  applied: boolean;
}

/** Coverage cảnh ăn tiền (03c-moneyshot-coverage → moneyshot_coverage_report.json). */
export interface EntCoverageSummary {
  detectedMoments: number;
  strongMoments: number;
  usedAnchors: number;
  minRequired: number;
  pass: boolean;
  anchors?: Array<{ tSec: number; tc: string; score: number; what: string }>;
}

/** Gói đăng tay (16-package → montage_v2/package.json). NO auto-publish. */
export interface EntPackageSummary {
  finalVideo: string;
  audioPolicyApplied?: boolean;
  caption: string;
  captionSource?: string;
  hashtags: string[];
  postingNotes: string[];
  autoPublish: false;
  generatedAt?: string;
}

export interface EntJob {
  jobId: string;
  lane: 'entertainment/fishing-vlog';
  niche: string;
  state: EntJobState;
  createdAt: string;
  updatedAt: string;
  source: EntSource;
  steps?: Partial<Record<EntStepName, EntStepStatus>>;
  script?: EntScriptSummary | null;
  coverage?: EntCoverageSummary | null;
  render?: EntRenderSummary | null;
  audio?: EntAudioSummary | null;
  package?: EntPackageSummary | null;
  reviewGates?: { scriptApproved: boolean; previewApproved: boolean };
  error?: { code: string; message: string } | null;
}

export function isValidNiche(niche: string): boolean {
  return NICHES.has(niche);
}

/** jobId chỉ chứa [a-z0-9_], luôn prefix ent_ — chống path traversal khi đọc. */
export function isValidJobId(id: string): boolean {
  return /^ent_[a-z0-9_]+$/.test(id);
}

function detectType(url: string): EntSource['type'] {
  if (/douyin\.com|iesdouyin/i.test(url)) return 'douyin';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'url';
}

function nowIso(): string {
  return new Date().toISOString();
}

function genJobId(niche: string): string {
  const short = niche.replace(/-vlog$/, '').replace(/[^a-z0-9]/g, '') || 'ent';
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `ent_${short}_${ts}`;
}

function manifestPath(id: string): string | null {
  if (!isValidJobId(id)) return null;
  return resolveInsideRepo(`${ENT_DIR_REL}/${id}/ent_job.json`);
}

/** Bỏ absolute repo path khỏi message lỗi trước khi trả ra UI. */
function sanitizeError(raw: string): string {
  const root = resolveInsideRepo('.') ?? '';
  return raw.replaceAll(root, '').replaceAll('\\', '/').replace(/\s+/g, ' ').trim().slice(-280);
}

export function readManifest(id: string): EntJob | null {
  const p = manifestPath(id);
  if (!p || !existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as EntJob;
  } catch {
    return null;
  }
}

function writeManifest(id: string, job: EntJob): void {
  const p = manifestPath(id);
  if (!p) throw new Error('INVALID_JOB_ID');
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(job, null, 2));
}

export function listJobs(): EntJob[] {
  const base = resolveInsideRepo(ENT_DIR_REL);
  if (!base || !existsSync(base)) return [];
  const jobs: EntJob[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidJobId(entry.name)) continue;
    const m = readManifest(entry.name);
    if (m) jobs.push(m);
  }
  return jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Tạo job giải trí + chạy intake (01-fetch-source) đồng bộ. Ghi manifest
 * INTAKE_RUNNING trước, rồi cập nhật INTAKE_DONE/FAILED sau khi tải xong.
 * KHÔNG ghi bất kỳ registry nào của Product Review/Shopee.
 */
export function createJob(input: { url: string; niche: string }): EntJob {
  const id = genJobId(input.niche);
  const now = nowIso();
  let job: EntJob = {
    jobId: id,
    lane: 'entertainment/fishing-vlog',
    niche: input.niche,
    state: 'INTAKE_RUNNING',
    createdAt: now,
    updatedAt: now,
    source: { url: input.url, type: detectType(input.url) },
    error: null,
  };
  writeManifest(id, job);

  const run = runRepoScript(FETCH_SCRIPT_REL, ['--id', id, '--url', input.url], FETCH_TIMEOUT_MS);
  const metaAbs = resolveInsideRepo(`${ENT_DIR_REL}/${id}/source_meta.json`);

  if (run.status === 0 && metaAbs && existsSync(metaAbs)) {
    try {
      const meta = JSON.parse(readFileSync(metaAbs, 'utf8')) as {
        durationSec?: number;
        width?: number | null;
        height?: number | null;
        fps?: number;
        hasAudio?: boolean;
      };
      job = {
        ...job,
        state: 'INTAKE_DONE',
        updatedAt: nowIso(),
        source: {
          ...job.source,
          path: `${ENT_DIR_REL}/${id}/source.mp4`,
          durationSec: meta.durationSec,
          width: meta.width ?? null,
          height: meta.height ?? null,
          fps: meta.fps,
          hasAudio: meta.hasAudio,
        },
        error: null,
      };
    } catch {
      job = {
        ...job,
        state: 'INTAKE_FAILED',
        updatedAt: nowIso(),
        error: { code: 'META_PARSE', message: 'source_meta.json không đọc được.' },
      };
    }
  } else {
    const stderr = run.stderr ?? '';
    const code = /DOWNLOAD_FAILED/.test(stderr)
      ? 'DOWNLOAD_FAILED'
      : /PROBE_FAILED/.test(stderr)
        ? 'PROBE_FAILED'
        : run.status === null
          ? 'TIMEOUT'
          : 'INTAKE_FAILED';
    job = {
      ...job,
      state: 'INTAKE_FAILED',
      updatedAt: nowIso(),
      error: { code, message: sanitizeError(stderr) || 'Intake thất bại.' },
    };
  }
  writeManifest(id, job);
  return job;
}

/* ── Step pipeline + content gate (E-UI-3) ──────────────────────────────────
 * Engine 20-pipeline.ts chạy DETACHED (analyze/montage/script vượt 120s) và tự
 * ghi data/temp/ent/<id>/steps/<step>.json. API chỉ ĐỌC step files (engine sở
 * hữu) và sở hữu ent_job.json — không cùng ghi 1 file ⇒ không race.
 * ========================================================================== */

const ALL_STEPS: EntStepName[] = ['analyze', 'montage', 'script', 'produce', 'render'];

/** Resolve một file con trong work dir của job (an toàn traversal). */
function entFile(id: string, rel: string): string | null {
  if (!isValidJobId(id)) return null;
  return resolveInsideRepo(`${ENT_DIR_REL}/${id}/${rel}`);
}
function entExists(id: string, rel: string): boolean {
  const p = entFile(id, rel);
  return !!p && existsSync(p);
}

function readJsonSafe<T>(absPath: string | null): T | null {
  if (!absPath || !existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Process còn sống? (kill(pid,0): ESRCH=chết, EPERM=sống nhưng khác quyền). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readStep(id: string, step: EntStepName): EntStepStatus | null {
  const raw = readJsonSafe<EntStepStatus>(entFile(id, `steps/${step}.json`));
  if (!raw) return null;
  const clean: EntStepStatus = { ...raw, error: raw.error ? sanitizeError(raw.error) : undefined };
  if (clean.state !== 'running') return clean;
  // Stale-detection để UI không treo + cho retry sạch khi process render chết:
  //  (1) có pid mà process không còn sống (kill từ ngoài, OOM…), hoặc
  //  (2) chưa kịp ghi pid nhưng đã quá 120s (engine không khởi động được).
  const pidDead = typeof raw.pid === 'number' && !isPidAlive(raw.pid);
  const ageMs = raw.startedAt ? Date.now() - new Date(raw.startedAt).getTime() : 0;
  const noPidStale = typeof raw.pid !== 'number' && ageMs > 120_000;
  if (pidDead || noPidStale) {
    return {
      ...clean,
      state: 'failed',
      error: clean.error ?? 'Tiến trình render đã dừng bất thường (process không còn chạy).',
    };
  }
  return clean;
}

function anyStepRunning(id: string): EntStepName | null {
  for (const s of ALL_STEPS) {
    if (readStep(id, s)?.state === 'running') return s;
  }
  return null;
}

/**
 * Global single-flight: chỉ 1 step được chạy tại 1 thời điểm trên TOÀN bộ job.
 * Chặn tận gốc việc 2 render/Demucs chạy đồng thời gây cạn RAM → process bị kill.
 * Dùng readStep (đã có pid stale-detection) ⇒ process đã chết KHÔNG bị tính là
 * đang chạy (không khoá oan).
 */
function findRunningStep(): { jobId: string; step: EntStepName } | null {
  const base = resolveInsideRepo(ENT_DIR_REL);
  if (!base || !existsSync(base)) return null;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidJobId(entry.name)) continue;
    for (const s of ALL_STEPS) {
      if (readStep(entry.name, s)?.state === 'running') return { jobId: entry.name, step: s };
    }
  }
  return null;
}

// Artifact-based prerequisites (nguồn sự thật là file engine đã tạo).
const intakeDone = (id: string) => entExists(id, 'source.mp4');
const analyzeDone = (id: string) =>
  entExists(id, 'asr_zh.json') && entExists(id, 'catch_moments.json');
const montageDone = (id: string) => entExists(id, 'montage_v2/montage.mp4');
const scriptDone = (id: string) => entExists(id, 'montage_v2/montage_v2_script.json');
// 12-voice-render ghi render_report.json (10-montage ghi report.json khác tên) ⇒
// marker sạch cho "voice-render từ script đã duyệt đã chạy".
const voiceRenderDone = (id: string) => entExists(id, 'montage_v2/montage_v2_render_report.json');
const previewFileExists = (id: string) =>
  entExists(id, 'montage_v2_short_ambient.mp4') || entExists(id, 'montage_v2_short.mp4');
const packageDone = (id: string) => entExists(id, 'montage_v2/package.json');

/** mtime (ms) của file ent, 0 nếu không có/không đọc được. */
function entMtimeMs(id: string, rel: string): number {
  const p = entFile(id, rel);
  if (!p || !existsSync(p)) return 0;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * E-UI-5 LOCK — audio policy `remove_speech_keep_ambient` ĐÃ áp THẬT, không
 * fake-success. TRUE chỉ khi TẤT CẢ:
 *  - có file `montage_v2_short_ambient.mp4`
 *  - audio_report tồn tại, `demucs === 'htdemucs/ok'`, KHÔNG `fallbackUsed`,
 *    `hasAudio === true` (15 all-or-nothing: report chỉ ghi khi Demucs THẬT chạy)
 *  - bản ambient KHÔNG stale: mtime ≥ base `montage_v2_short.mp4` (tức ambient
 *    được làm từ bản render hiện tại, không phải ambient cũ của montage trước)
 * Bất kỳ điều kiện nào sai → coi như CHƯA áp → chặn GATE 2 / đóng gói.
 */
function audioPolicyApplied(id: string): boolean {
  if (!entExists(id, 'montage_v2_short_ambient.mp4')) return false;
  const rep = readJsonSafe<{ demucs?: string; fallbackUsed?: string | null; hasAudio?: boolean }>(
    entFile(id, 'montage_v2/montage_v2_audio_report.json'),
  );
  if (!rep || rep.fallbackUsed != null || rep.demucs !== 'htdemucs/ok' || rep.hasAudio !== true) {
    return false;
  }
  const ambientMs = entMtimeMs(id, 'montage_v2_short_ambient.mp4');
  const baseMs = entMtimeMs(id, 'montage_v2_short.mp4');
  if (baseMs > 0 && ambientMs < baseMs) return false; // ambient cũ hơn base → stale
  return true;
}

/** State machine §1: suy ra state từ artifact + gate (chỉ khi intake đã xong). */
function reconcileState(id: string, job: EntJob): EntJobState {
  if (!intakeDone(id)) return job.state; // INTAKE_RUNNING / FAILED giữ nguyên
  const sApproved = job.reviewGates?.scriptApproved === true;
  const pApproved = job.reviewGates?.previewApproved === true;
  // Preview chỉ tính khi script ĐÃ duyệt + voice-render đã chạy.
  if (sApproved && voiceRenderDone(id)) {
    if (pApproved) return packageDone(id) ? 'PACKAGED' : 'APPROVED';
    return 'PREVIEW_PENDING';
  }
  if (scriptDone(id)) return sApproved ? 'SCRIPT_APPROVED' : 'SCRIPT_PENDING';
  if (montageDone(id)) return 'MONTAGE_READY';
  if (analyzeDone(id)) return 'ANALYZED';
  return 'INTAKE_DONE';
}

function readScriptSummary(id: string): EntScriptSummary | null {
  const j = readJsonSafe<{
    reviewStatus?: string;
    scriptModel?: string;
    sourceBound?: boolean;
    chunkCount?: number;
    boundChunks?: number;
    microChunks?: number;
    estTotalSpeechSec?: number;
    montageTotalSec?: number;
  }>(entFile(id, 'montage_v2/montage_v2_script.json'));
  if (!j) return null;
  return {
    ref: `${ENT_DIR_REL}/${id}/montage_v2/montage_v2_script.json`,
    reviewStatus: j.reviewStatus ?? 'PENDING_OPERATOR_REVIEW',
    scriptModel: j.scriptModel,
    sourceBound: j.sourceBound,
    chunkCount: j.chunkCount,
    boundChunks: j.boundChunks,
    microChunks: j.microChunks,
    estTotalSpeechSec: j.estTotalSpeechSec,
    montageTotalSec: j.montageTotalSec,
  };
}

function readRenderSummary(id: string): EntRenderSummary | null {
  const j = readJsonSafe<{
    verdict?: string;
    hashMatch?: boolean;
    captionOverlap?: number;
    captionTightButReadable?: number;
    realVoiceEndSec?: number;
    montageTotalSec?: number;
    outputDurationSec?: number;
    voiceSpillMoneyShot?: unknown[];
    voiceMarginDb?: number;
    bgmDrownsVoice?: boolean;
    bgm?: string | null;
    scrubMaskSegments?: number;
  }>(entFile(id, 'montage_v2/montage_v2_render_report.json'));
  if (!j) return null;
  return {
    verdict: j.verdict ?? '?',
    hashMatch: j.hashMatch === true,
    captionOverlap: j.captionOverlap ?? 0,
    captionTightButReadable: j.captionTightButReadable,
    realVoiceEndSec: j.realVoiceEndSec,
    montageTotalSec: j.montageTotalSec,
    outputDurationSec: j.outputDurationSec,
    voiceSpillMoneyShot: Array.isArray(j.voiceSpillMoneyShot) ? j.voiceSpillMoneyShot.length : 0,
    voiceMarginDb: j.voiceMarginDb,
    bgmDrownsVoice: j.bgmDrownsVoice,
    bgm: j.bgm ?? null,
    scrubMaskSegments: j.scrubMaskSegments,
    previewReady: previewFileExists(id),
  };
}

function readAudioSummary(id: string): EntAudioSummary | null {
  const j = readJsonSafe<{
    audioMode?: string;
    demucs?: string;
    ambientLevel?: number;
    ducking?: string;
    bgm?: string | null;
    fallbackUsed?: string | null;
    voiceAboveAmbientDb?: number;
    loudness?: { ambientKeptMaxDb?: number; vocalsRemovedMaxDb?: number };
  }>(entFile(id, 'montage_v2/montage_v2_audio_report.json'));
  if (!j) return null;
  return {
    audioMode: j.audioMode ?? 'remove_speech_keep_ambient',
    demucs: j.demucs ?? '?',
    ambientLevel: j.ambientLevel,
    ducking: j.ducking,
    bgm: j.bgm ?? null,
    fallbackUsed: j.fallbackUsed ?? null,
    voiceAboveAmbientDb: j.voiceAboveAmbientDb,
    ambientKeptMaxDb: j.loudness?.ambientKeptMaxDb,
    vocalsRemovedMaxDb: j.loudness?.vocalsRemovedMaxDb,
    applied: audioPolicyApplied(id), // E-UI-5: áp THẬT (no stale/fallback), không chỉ file-exists
  };
}

function readCoverageSummary(id: string): EntCoverageSummary | null {
  const j = readJsonSafe<{
    detectedMoments?: number;
    strongMoments?: number;
    usedAnchors?: number;
    minRequired?: number;
    pass?: boolean;
    anchors?: Array<{ tSec?: number; tc?: string; score?: number; what?: string }>;
  }>(entFile(id, 'moneyshot_coverage_report.json'));
  if (!j) return null;
  return {
    detectedMoments: j.detectedMoments ?? 0,
    strongMoments: j.strongMoments ?? 0,
    usedAnchors: j.usedAnchors ?? 0,
    minRequired: j.minRequired ?? 0,
    pass: j.pass === true,
    anchors: (j.anchors ?? []).map((a) => ({
      tSec: a.tSec ?? 0,
      tc: a.tc ?? '',
      score: a.score ?? 0,
      what: a.what ?? '',
    })),
  };
}

function readPackageSummary(id: string): EntPackageSummary | null {
  const j = readJsonSafe<{
    finalVideo?: string;
    audioPolicyApplied?: boolean;
    caption?: string;
    captionSource?: string;
    hashtags?: string[];
    postingNotes?: string[];
    generatedAt?: string;
  }>(entFile(id, 'montage_v2/package.json'));
  if (!j) return null;
  return {
    finalVideo: j.finalVideo ?? '',
    audioPolicyApplied: j.audioPolicyApplied,
    caption: j.caption ?? '',
    captionSource: j.captionSource,
    hashtags: Array.isArray(j.hashtags) ? j.hashtags : [],
    postingNotes: Array.isArray(j.postingNotes) ? j.postingNotes : [],
    autoPublish: false,
    generatedAt: j.generatedAt,
  };
}

/**
 * Job + live step status + script summary + gate. Reconcile state từ artifact và
 * ghi lại manifest (chỉ state/gate/script summary; KHÔNG ghi steps vào manifest
 * để engine giữ quyền sở hữu step files).
 */
export function getJobDetail(id: string): EntJob | null {
  const base = readManifest(id);
  if (!base) return null;

  const steps: Partial<Record<EntStepName, EntStepStatus>> = {};
  for (const s of ALL_STEPS) {
    const st = readStep(id, s);
    if (st) steps[s] = st;
  }
  const script = readScriptSummary(id);
  const coverage = readCoverageSummary(id);
  const render = readRenderSummary(id);
  const audio = readAudioSummary(id);
  const pkg = readPackageSummary(id);
  const reviewGates = base.reviewGates ?? { scriptApproved: false, previewApproved: false };
  const state = reconcileState(id, base);

  // Persist reconciled fields nếu đổi (giữ manifest tươi cho list view).
  if (
    state !== base.state ||
    !base.reviewGates ||
    JSON.stringify(base.script ?? null) !== JSON.stringify(script) ||
    JSON.stringify(base.coverage ?? null) !== JSON.stringify(coverage) ||
    JSON.stringify(base.render ?? null) !== JSON.stringify(render) ||
    JSON.stringify(base.audio ?? null) !== JSON.stringify(audio) ||
    JSON.stringify(base.package ?? null) !== JSON.stringify(pkg)
  ) {
    writeManifest(id, {
      ...base,
      state,
      reviewGates,
      script,
      coverage,
      render,
      audio,
      package: pkg,
      updatedAt: nowIso(),
    });
  }

  return { ...base, state, steps, script, coverage, render, audio, package: pkg, reviewGates };
}

/** Tiền điều kiện artifact + gate cho mỗi step. */
function prereqOk(id: string, step: EntStepName): { ok: true } | { ok: false; need: string } {
  if (step === 'analyze' || step === 'produce') {
    return intakeDone(id) ? { ok: true } : { ok: false, need: 'INTAKE (source.mp4)' };
  }
  if (step === 'render') {
    // GATE 1 BẮT BUỘC: không voice/render khi script chưa được Operator duyệt.
    if (!montageDone(id)) return { ok: false, need: 'MONTAGE (montage.mp4)' };
    if (!scriptDone(id)) return { ok: false, need: 'SCRIPT (montage_v2_script.json)' };
    const approved = readManifest(id)?.reviewGates?.scriptApproved === true;
    return approved ? { ok: true } : { ok: false, need: 'duyệt script (GATE 1)' };
  }
  // montage / script cần analyze xong (asr + catch_moments).
  return analyzeDone(id) ? { ok: true } : { ok: false, need: 'ANALYZE (asr_zh + catch_moments)' };
}

export type StartStepResult =
  | { ok: true; step: EntStepName; pid?: number }
  | { ok: false; code: 'NOT_FOUND' | 'BAD_STATE' | 'BUSY' | 'PREREQ'; message: string };

/**
 * Khởi chạy 1 step pipeline DETACHED. Single-flight mỗi job (1 step chạy 1 lúc)
 * để 10/13 không cùng ghi montage_v2_script.json. "produce" chạy FULL chain
 * (analyze→…→render→audio) tới preview — cổng tay duy nhất là Duyệt video (GATE 2).
 */
export function startStep(id: string, step: EntStepName): StartStepResult {
  if (!isValidJobId(id)) return { ok: false, code: 'NOT_FOUND', message: 'jobId không hợp lệ.' };
  const job = readManifest(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };

  const pre = prereqOk(id, step);
  if (!pre.ok) return { ok: false, code: 'PREREQ', message: `Cần ${pre.need} trước.` };

  // Global single-flight: 1 render/lúc trên toàn hệ (tránh đè RAM gây kill).
  const running = findRunningStep();
  if (running) {
    return {
      ok: false,
      code: 'BUSY',
      message:
        running.jobId === id
          ? `Đang chạy "${running.step}" cho job này. Chờ xong rồi chạy tiếp.`
          : `Hệ thống đang chạy "${running.step}" cho job ${running.jobId} (chỉ 1 render/lúc). Chờ xong rồi chạy.`,
    };
  }

  // GATE 1 đã GỘP: produce = full chain tới preview nên script auto-duyệt (cổng
  // tay duy nhất còn lại = Duyệt video). Set trước để reconcile lên PREVIEW_PENDING
  // khi render xong, và để approvePreview không vướng NO_SCRIPT_GATE.
  if (step === 'produce' && job.reviewGates?.scriptApproved !== true) {
    writeManifest(id, {
      ...job,
      reviewGates: { scriptApproved: true, previewApproved: false },
      updatedAt: nowIso(),
    });
  }

  const stepsDir = entFile(id, 'steps');
  const logPath = entFile(id, `steps/${step}.log`);
  const statusPath = entFile(id, `steps/${step}.json`);
  if (!stepsDir || !logPath || !statusPath) {
    return { ok: false, code: 'BAD_STATE', message: 'Không resolve được steps dir.' };
  }
  mkdirSync(stepsDir, { recursive: true });
  // Initial running status để UI phản hồi ngay (engine sẽ ghi đè khi start).
  const initial: EntStepStatus = { step, state: 'running', startedAt: nowIso(), subs: [] };
  writeFileSync(statusPath, JSON.stringify(initial, null, 2));

  const { pid } = runRepoScriptDetached(
    PIPELINE_SCRIPT_REL,
    ['--id', id, '--step', step, '--model', SCRIPT_MODEL],
    logPath,
  );
  return { ok: true, step, pid };
}

/** GATE 1 — Operator duyệt nội dung script. Yêu cầu script đã tạo. */
export function approveScript(
  id: string,
): { ok: true; job: EntJob } | { ok: false; code: string; message: string } {
  if (!isValidJobId(id)) return { ok: false, code: 'NOT_FOUND', message: 'jobId không hợp lệ.' };
  const job = readManifest(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };
  if (!scriptDone(id)) {
    return {
      ok: false,
      code: 'NO_SCRIPT',
      message: 'Chưa có script để duyệt — chạy bước script trước.',
    };
  }
  if (anyStepRunning(id)) {
    return { ok: false, code: 'BUSY', message: 'Đang chạy pipeline — chờ xong rồi duyệt.' };
  }
  writeManifest(id, {
    ...job,
    reviewGates: {
      scriptApproved: true,
      previewApproved: job.reviewGates?.previewApproved ?? false,
    },
    state: 'SCRIPT_APPROVED',
    updatedAt: nowIso(),
  });
  const detail = getJobDetail(id);
  return detail
    ? { ok: true, job: detail }
    : { ok: false, code: 'BAD_STATE', message: 'Không đọc lại được job.' };
}

/** GATE 2 — Operator duyệt preview. Yêu cầu voice-render đã chạy. READY ≠ đăng. */
export function approvePreview(
  id: string,
): { ok: true; job: EntJob } | { ok: false; code: string; message: string } {
  if (!isValidJobId(id)) return { ok: false, code: 'NOT_FOUND', message: 'jobId không hợp lệ.' };
  const job = readManifest(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };
  if (job.reviewGates?.scriptApproved !== true) {
    return { ok: false, code: 'NO_SCRIPT_GATE', message: 'Chưa qua GATE 1 (duyệt script).' };
  }
  if (!voiceRenderDone(id) || !previewFileExists(id)) {
    return { ok: false, code: 'NO_PREVIEW', message: 'Chưa có preview — chạy voice/render trước.' };
  }
  if (anyStepRunning(id)) {
    return { ok: false, code: 'BUSY', message: 'Đang chạy pipeline — chờ xong rồi duyệt.' };
  }
  // E-UI-5 LOCK: KHÔNG cho duyệt bản chưa áp audio policy thật (chưa bỏ giọng
  // Trung / bản ambient cũ). Không fake-success — bắt render lại.
  if (!audioPolicyApplied(id)) {
    return {
      ok: false,
      code: 'AUDIO_NOT_APPLIED',
      message:
        'Audio policy remove_speech_keep_ambient CHƯA áp thật (Demucs chưa chạy / bản ambient cũ). Bấm "Sản xuất video" để render lại — không duyệt bản chưa bỏ giọng Trung.',
    };
  }
  writeManifest(id, {
    ...job,
    reviewGates: { scriptApproved: true, previewApproved: true },
    state: 'APPROVED',
    updatedAt: nowIso(),
  });
  const detail = getJobDetail(id);
  return detail
    ? { ok: true, job: detail }
    : { ok: false, code: 'BAD_STATE', message: 'Không đọc lại được job.' };
}

/** GATE 2 reject — bỏ duyệt preview, quay lại PREVIEW_PENDING để sửa/re-render. */
export function rejectPreview(
  id: string,
): { ok: true; job: EntJob } | { ok: false; code: string; message: string } {
  if (!isValidJobId(id)) return { ok: false, code: 'NOT_FOUND', message: 'jobId không hợp lệ.' };
  const job = readManifest(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };
  writeManifest(id, {
    ...job,
    reviewGates: {
      scriptApproved: job.reviewGates?.scriptApproved ?? false,
      previewApproved: false,
    },
    updatedAt: nowIso(),
  });
  const detail = getJobDetail(id);
  return detail
    ? { ok: true, job: detail }
    : { ok: false, code: 'BAD_STATE', message: 'Không đọc lại được job.' };
}

/** Đường dẫn tuyệt đối file preview (ambient nếu có, không thì bản voice-render). */
export function previewVideoPath(id: string): string | null {
  if (!isValidJobId(id)) return null;
  const ambient = entFile(id, 'montage_v2_short_ambient.mp4');
  if (ambient && existsSync(ambient)) return ambient;
  const short = entFile(id, 'montage_v2_short.mp4');
  return short && existsSync(short) ? short : null;
}

/**
 * B8 — Đóng gói cho đăng TAY (16-package, SYNC vì chỉ 1 call caption). Yêu cầu
 * GATE 2 (previewApproved) + có final video. KHÔNG auto-publish. Set PACKAGED.
 */
export function runPackage(
  id: string,
): { ok: true; job: EntJob } | { ok: false; code: string; message: string } {
  if (!isValidJobId(id)) return { ok: false, code: 'NOT_FOUND', message: 'jobId không hợp lệ.' };
  const job = readManifest(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };
  if (job.reviewGates?.previewApproved !== true) {
    return { ok: false, code: 'NO_PREVIEW_GATE', message: 'Chưa qua GATE 2 (duyệt preview).' };
  }
  if (!previewFileExists(id)) {
    return { ok: false, code: 'NO_FINAL', message: 'Chưa có video final — render trước.' };
  }
  // E-UI-5 LOCK (phòng thủ 2 lớp): chỉ đóng gói bản đã áp audio policy thật.
  if (!audioPolicyApplied(id)) {
    return {
      ok: false,
      code: 'AUDIO_NOT_APPLIED',
      message:
        'Audio policy chưa áp thật — không đóng gói bản chưa bỏ giọng Trung. Render lại trước.',
    };
  }
  const running = findRunningStep();
  if (running) {
    return { ok: false, code: 'BUSY', message: `Hệ thống đang chạy "${running.step}". Chờ xong.` };
  }

  const run = runRepoScript(
    PACKAGE_SCRIPT_REL,
    ['--id', id, '--model', SCRIPT_MODEL],
    PACKAGE_TIMEOUT_MS,
  );
  if (run.status !== 0 || !packageDone(id)) {
    return {
      ok: false,
      code: 'PACKAGE_FAILED',
      message: sanitizeError(run.stderr ?? '') || 'Đóng gói thất bại.',
    };
  }
  const detail = getJobDetail(id);
  return detail
    ? { ok: true, job: detail }
    : { ok: false, code: 'BAD_STATE', message: 'Không đọc lại được job.' };
}

export interface EntScriptBeat {
  role: string;
  text: string;
  montageTime: number;
  estSec: number;
  srcId?: number;
  sceneIdx?: number;
}
export interface EntScriptReview {
  summary: EntScriptSummary;
  beats: EntScriptBeat[];
  sourceLines: Array<{ id: number; sceneIdx: number; zh: string; mStart: number; mEnd: number }>;
  reviewMd: string | null;
  approved: boolean;
}

/** Dữ liệu cho panel duyệt script (render từ artifact THẬT, không bịa). */
export function getScriptReview(id: string): EntScriptReview | null {
  const summary = readScriptSummary(id);
  if (!summary) return null;
  const scriptJson = readJsonSafe<{ beats?: EntScriptBeat[] }>(
    entFile(id, 'montage_v2/montage_v2_script.json'),
  );
  const cutRef = readJsonSafe<{
    lines?: Array<{ id: number; sceneIdx: number; zh: string; mStart: number; mEnd: number }>;
  }>(entFile(id, 'montage_v2/source_cut_reference.json'));
  const mdPath = entFile(id, 'montage_v2/montage_v2_script_review.md');
  let reviewMd: string | null = null;
  if (mdPath && existsSync(mdPath)) {
    try {
      reviewMd = readFileSync(mdPath, 'utf8');
    } catch {
      reviewMd = null;
    }
  }
  const job = readManifest(id);
  return {
    summary,
    beats: scriptJson?.beats ?? [],
    sourceLines: cutRef?.lines ?? [],
    reviewMd,
    approved: job?.reviewGates?.scriptApproved === true,
  };
}
