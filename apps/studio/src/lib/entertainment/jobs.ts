/* =============================================================================
 * VFOS Studio — Entertainment lane job store (E-UI-2) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * Manifest IO + intake orchestration cho lane Giải trí/Vlog Câu cá. Tách HẲN
 * khỏi Product Review: ghi vào namespace runtime riêng data/temp/ent/<id>/,
 * KHÔNG đụng Product Card / Shopee / publish / review registry.
 * Manifest schema theo docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md (§4).
 * Chỉ import từ route handlers dưới app/api/studio/entertainment/*.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript, runRepoScriptDetached } from '@/lib/studio-data/run-command';

const ENT_DIR_REL = 'data/temp/ent';
const FETCH_SCRIPT_REL = 'scripts/ent-vlog/01-fetch-source.ts';
const PIPELINE_SCRIPT_REL = 'scripts/ent-vlog/20-pipeline.ts';
const FETCH_TIMEOUT_MS = 240_000; // download có thể vài chục giây
const SCRIPT_MODEL = 'gpt-5.5'; // source-bound transcreation (13-source-bound)
const NICHES = new Set(['fishing-vlog', 'car-vlog']);

export type EntJobState =
  | 'INTAKE_RUNNING'
  | 'INTAKE_DONE'
  | 'INTAKE_FAILED'
  | 'ANALYZED'
  | 'MONTAGE_READY'
  | 'SCRIPT_PENDING'
  | 'SCRIPT_APPROVED';

/** Logical pipeline steps the UI can trigger (engine 20-pipeline.ts). */
export type EntStepName = 'analyze' | 'montage' | 'script' | 'produce';
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

const ALL_STEPS: EntStepName[] = ['analyze', 'montage', 'script', 'produce'];

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

export function readStep(id: string, step: EntStepName): EntStepStatus | null {
  const raw = readJsonSafe<EntStepStatus>(entFile(id, `steps/${step}.json`));
  if (!raw) return null;
  return { ...raw, error: raw.error ? sanitizeError(raw.error) : undefined };
}

function anyStepRunning(id: string): EntStepName | null {
  for (const s of ALL_STEPS) {
    if (readStep(id, s)?.state === 'running') return s;
  }
  return null;
}

// Artifact-based prerequisites (nguồn sự thật là file engine đã tạo).
const intakeDone = (id: string) => entExists(id, 'source.mp4');
const analyzeDone = (id: string) =>
  entExists(id, 'asr_zh.json') && entExists(id, 'catch_moments.json');
const montageDone = (id: string) => entExists(id, 'montage_v2/montage.mp4');
const scriptDone = (id: string) => entExists(id, 'montage_v2/montage_v2_script.json');

/** State machine §1: suy ra state từ artifact + gate (chỉ khi intake đã xong). */
function reconcileState(id: string, job: EntJob): EntJobState {
  if (!intakeDone(id)) return job.state; // INTAKE_RUNNING / FAILED giữ nguyên
  const approved = job.reviewGates?.scriptApproved === true;
  if (scriptDone(id)) return approved ? 'SCRIPT_APPROVED' : 'SCRIPT_PENDING';
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
  const reviewGates = base.reviewGates ?? { scriptApproved: false, previewApproved: false };
  const state = reconcileState(id, base);

  // Persist reconciled fields nếu đổi (giữ manifest tươi cho list view).
  if (
    state !== base.state ||
    !base.reviewGates ||
    JSON.stringify(base.script ?? null) !== JSON.stringify(script)
  ) {
    writeManifest(id, {
      ...base,
      state,
      reviewGates,
      script,
      updatedAt: nowIso(),
    });
  }

  return { ...base, state, steps, script, reviewGates };
}

/** Tiền điều kiện artifact cho mỗi step. */
function prereqOk(id: string, step: EntStepName): { ok: true } | { ok: false; need: string } {
  if (step === 'analyze' || step === 'produce') {
    return intakeDone(id) ? { ok: true } : { ok: false, need: 'INTAKE (source.mp4)' };
  }
  // montage / script cần analyze xong (asr + catch_moments).
  return analyzeDone(id) ? { ok: true } : { ok: false, need: 'ANALYZE (asr_zh + catch_moments)' };
}

export type StartStepResult =
  | { ok: true; step: EntStepName; pid?: number }
  | { ok: false; code: 'NOT_FOUND' | 'BAD_STATE' | 'BUSY' | 'PREREQ'; message: string };

/**
 * Khởi chạy 1 step pipeline DETACHED. Single-flight mỗi job (1 step chạy 1 lúc)
 * để 10/13 không cùng ghi montage_v2_script.json. Dừng TRƯỚC voice/render — GATE 1.
 */
export function startStep(id: string, step: EntStepName): StartStepResult {
  if (!isValidJobId(id)) return { ok: false, code: 'NOT_FOUND', message: 'jobId không hợp lệ.' };
  const job = readManifest(id);
  if (!job) return { ok: false, code: 'NOT_FOUND', message: 'Job không tồn tại.' };

  const pre = prereqOk(id, step);
  if (!pre.ok) return { ok: false, code: 'PREREQ', message: `Cần ${pre.need} trước.` };

  const running = anyStepRunning(id);
  if (running) {
    return { ok: false, code: 'BUSY', message: `Đang chạy "${running}". Chờ xong rồi chạy tiếp.` };
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
