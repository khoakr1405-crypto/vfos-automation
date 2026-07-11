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
import {
  accountConfigured,
  getAccountTokens,
  isAccountTokenExpired,
} from '@/lib/tiktok/account-store';
import {
  createMockTikTokPublishClient,
  createTikTokPublishClient,
  queryCreatorUsername,
} from '@/lib/tiktok/tiktok-publish-client';
import { publishReelToPage } from '@vfos/facebook';
import { type EntChannel, getChannel, listChannels, resolveChannelForJob } from './channels';
import {
  type EntFacebookPublishSummary,
  type EntFacebookReadiness,
  type FacebookPublishClient,
  type FacebookPublishDeps,
  type FacebookPublishJobView,
  type ResolveFbClientResult,
  computeFacebookReadiness,
} from './facebook-publish';
import { computeReadiness } from './publish';
import type {
  EntTikTokPublishSummary,
  EntTikTokReadiness,
  PublishDeps,
  PublishJobView,
  ResolveClientResult,
} from './publish';

export type { EntTikTokPublishSummary, EntTikTokReadiness } from './publish';
export type { EntFacebookPublishSummary, EntFacebookReadiness } from './facebook-publish';

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
  | 'PACKAGED'
  | 'TIKTOK_POSTING'
  | 'TIKTOK_POSTED'
  | 'TIKTOK_FAILED';

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

/** Story classification surface từ story_arc.json (03d-source-classify) cho UI/manifest. */
export interface EntStorySummary {
  confidence?: string;
  sourceType?: string;
}

export interface EntJob {
  jobId: string;
  lane: string;
  niche: string;
  /** Kênh bind (multi-channel) — immutable từ lúc tạo. Job cũ chưa có → suy từ niche. */
  channelId?: string;
  /** Account TikTok đích bind — immutable. Chống đăng nhầm kênh. */
  accountId?: string;
  channelNiche?: string;
  channelBoundAt?: string;
  /** Engine montage: 'story' (kể chuyện, mặc định lane) | 'anchors' (cũ). Thiếu = 'story'. */
  storyEngine?: 'story' | 'anchors';
  /** Story classification (surface từ story_arc.json) — audit/UI; null khi chưa phân loại. */
  story?: EntStorySummary | null;
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
  tiktok?: EntTikTokPublishSummary | null;
  /** Tóm tắt đăng Facebook (lane Giải trí đổi target sang FB). Additive — job cũ null. */
  facebook?: EntFacebookPublishSummary | null;
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
 * Khoá chuẩn hoá 1 video nguồn để chống reup trùng. Douyin/TikTok `/video/<id>`
 * → id; còn lại (vd share link v.douyin.com chưa resolve) → origin+path lowercase.
 */
export function canonicalVideoKey(url: string): string {
  const u = (url ?? '').trim();
  const m = u.match(/\/video\/(\d+)/);
  if (m) return m[1];
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return u.toLowerCase().replace(/\/+$/, '');
  }
}

/** Share link rút gọn (v.douyin.com / v.iesdouyin.com) — cần resolve để lấy aweme_id. */
const SHORT_LINK_RE = /^https?:\/\/v\.(?:douyin|iesdouyin)\.com\//i;
const ID_CACHE_REL = `${ENT_DIR_REL}/.source_id_cache.json`;
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

function readIdCache(): Record<string, string> {
  const p = resolveInsideRepo(ID_CACHE_REL);
  if (!p || !existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}
function writeIdCache(c: Record<string, string>): void {
  const p = resolveInsideRepo(ID_CACHE_REL);
  if (!p) return;
  try {
    writeFileSync(p, JSON.stringify(c, null, 2));
  } catch {
    /* cache phụ — lỗi ghi không chặn dedup */
  }
}

/** Resolve share link rút gọn → aweme_id canonical (lần theo redirect `share/video/<id>`). */
async function resolveShortLinkId(url: string): Promise<string | null> {
  try {
    let cur = url;
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(cur, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': DESKTOP_UA },
      });
      const loc = res.headers.get('location');
      const probe = loc ?? res.url;
      const m = probe.match(/\/(?:share\/)?video\/(\d+)/);
      if (m) return m[1];
      if (!loc) return null;
      cur = new URL(loc, cur).toString();
    }
  } catch {
    /* mạng lỗi → fallback normalized url ở caller */
  }
  return null;
}

/**
 * Tập khoá video nguồn ĐÃ reup (từ source.url của mọi job) — để gắn cờ alreadyReused.
 * Job lưu canonical `/video/<id>` → khớp ngay; job lưu SHARE LINK rút gọn → resolve
 * sang aweme_id (cache lại) để vẫn khớp candidate canonical, chống reup video đã đăng.
 * LOẠI job INTAKE_FAILED (chưa tải được byte nào) — không cho job lỗi chiếm khoá
 * vĩnh viễn khiến video không bao giờ retry được. GIỮ INTAKE_RUNNING trong tập
 * (loại nó sẽ mở cửa sổ race tạo job trùng khi đang fetch) — TRỪ zombie quá hạn.
 */
export async function reusedSourceKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const cache = readIdCache();
  let cacheDirty = false;
  for (const j of listJobs()) {
    if (j.state === 'INTAKE_FAILED' || isDeadIntakeRunning(j)) continue;
    const url = j.source?.url;
    if (!url) continue;
    const sync = canonicalVideoKey(url);
    if (/^\d+$/.test(sync)) {
      out.add(sync);
      continue;
    }
    if (SHORT_LINK_RE.test(url)) {
      let id = cache[url];
      if (!id) {
        const resolved = await resolveShortLinkId(url);
        if (resolved) {
          id = resolved;
          cache[url] = resolved;
          cacheDirty = true;
        }
      }
      if (id) {
        out.add(id);
        continue;
      }
    }
    out.add(sync);
  }
  if (cacheDirty) writeIdCache(cache);
  return out;
}

/**
 * INTAKE_RUNNING quá hạn = zombie: intake chạy SYNC (spawnSync, tối đa
 * FETCH_TIMEOUT_MS) nên RUNNING lâu hơn timeout + margin chỉ có thể là process
 * studio bị kill giữa chừng — manifest kẹt RUNNING mãi (reconcileState không
 * chuyển khi chưa có source.mp4, không có pid để probe như readStep). Không
 * được để zombie giữ khoá dedup + chặn 409 vĩnh viễn.
 */
const INTAKE_RUNNING_STALE_MS = FETCH_TIMEOUT_MS + 60_000;
function isDeadIntakeRunning(j: EntJob): boolean {
  if (j.state !== 'INTAKE_RUNNING') return false;
  const t = Date.parse(j.updatedAt || j.createdAt || '');
  if (Number.isNaN(t)) return true; // manifest hỏng timestamp — không chứng minh được đang sống
  return Date.now() - t > INTAKE_RUNNING_STALE_MS;
}

/**
 * Job "đang sống" (khác INTAKE_FAILED / zombie RUNNING) đã dùng cùng video nguồn —
 * guard server-side chống tạo job trùng (vd bấm "Lấy mới nhất" 2 lần với cache
 * client cũ; cặp trùng thật: ent_fishing_20260626_232632/232656).
 *
 * Guard này trả 409 HARD BLOCK nên chỉ khớp bằng khoá MẠNH: aweme_id từ
 * `/video/<id>` hoặc share link đã resolve trong id-cache (sync, không network).
 * Khoá yếu origin+path VỨT QUERY — 2 video `discover?modal_id=<id>` khác nhau
 * sẽ va key → chặn nhầm; với khoá yếu chỉ chặn khi URL trùng nguyên văn.
 */
export function findLivingJobBySourceKey(url: string): EntJob | null {
  const cache = readIdCache();
  const strongKey = (u: string): string | null => {
    const k = canonicalVideoKey(u);
    if (/^\d+$/.test(k)) return k;
    if (SHORT_LINK_RE.test(u) && cache[u]) return cache[u] as string;
    return null;
  };
  const inputStrong = strongKey(url);
  const inputRaw = (url ?? '').trim();
  for (const j of listJobs()) {
    if (j.state === 'INTAKE_FAILED' || isDeadIntakeRunning(j)) continue;
    const u = j.source?.url;
    if (!u) continue;
    if (inputStrong !== null) {
      if (strongKey(u) === inputStrong) return j;
    } else if (u.trim() === inputRaw) {
      return j;
    }
  }
  return null;
}

/**
 * Tạo job giải trí + chạy intake (01-fetch-source) đồng bộ. Ghi manifest
 * INTAKE_RUNNING trước, rồi cập nhật INTAKE_DONE/FAILED sau khi tải xong.
 * KHÔNG ghi bất kỳ registry nào của Product Review/Shopee.
 */
export function createJob(input: { url: string; niche: string; channelId?: string }): EntJob {
  const id = genJobId(input.niche);
  const now = nowIso();
  // Bind kênh NGAY lúc tạo (immutable): ưu tiên channelId tường minh, fallback niche.
  const channel = resolveChannelForJob({ channelId: input.channelId, niche: input.niche });
  let job: EntJob = {
    jobId: id,
    lane: 'entertainment',
    niche: input.niche,
    // Per-channel: copy storyEngine từ channel (defensive — thiếu/sai/null → 'story').
    storyEngine: jobStoryEngineFor(channel),
    ...(channel
      ? {
          channelId: channel.channelId,
          accountId: channel.accountId,
          channelNiche: channel.niche,
          channelBoundAt: now,
        }
      : {}),
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

/** POSTING cũ hơn ngưỡng này coi là treo → reconcile rớt về state artifact. */
const POSTING_STALE_MS = 5 * 60 * 1000;

/** State machine §1: suy ra state từ artifact + gate (chỉ khi intake đã xong). */
function reconcileState(id: string, job: EntJob): EntJobState {
  if (!intakeDone(id)) return job.state; // INTAKE_RUNNING / FAILED giữ nguyên
  // Phase 3 — trạng thái TikTok bám manifest.tiktok (không suy từ artifact).
  const tk = job.tiktok;
  if (tk?.status === 'POSTED') return 'TIKTOK_POSTED';
  if (tk?.status === 'POSTING') {
    const ageMs = tk.startedAt
      ? Date.now() - new Date(tk.startedAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (ageMs <= POSTING_STALE_MS) return 'TIKTOK_POSTING';
    // POSTING treo → rớt xuống reconcile artifact (giữ tiktok.error cho UI).
  }
  // FAILED: state theo artifact (PACKAGED) để cho retry; tiktok.status=FAILED vẫn hiện.
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

/**
 * Surface story classification từ story_arc.json (03d-source-classify) — READ-ONLY.
 * Trả null khi chưa phân loại (không có file / không có field) → KHÔNG làm bẩn manifest.
 */
export function readStorySummary(id: string): EntStorySummary | null {
  const j = readJsonSafe<{ story_confidence?: string; source_type?: string }>(
    entFile(id, 'story_arc.json'),
  );
  if (!j) return null;
  const confidence = j.story_confidence;
  const sourceType = j.source_type;
  if (confidence == null && sourceType == null) return null;
  return {
    ...(confidence != null ? { confidence } : {}),
    ...(sourceType != null ? { sourceType } : {}),
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
  const story = readStorySummary(id);
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
    JSON.stringify(base.package ?? null) !== JSON.stringify(pkg) ||
    JSON.stringify(base.story ?? null) !== JSON.stringify(story)
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
      story,
      updatedAt: nowIso(),
    });
  }

  return {
    ...base,
    state,
    steps,
    script,
    coverage,
    render,
    audio,
    package: pkg,
    story,
    reviewGates,
  };
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
 * Engine montage cho spawn (ENT_MONTAGE_ENGINE). DEFENSIVE: chỉ 'anchors' TƯỜNG MINH
 * mới trả 'anchors'; mọi trường hợp khác (thiếu field / manifest cũ / giá trị lạ) → 'story'.
 * → KHÔNG đổi hành vi hiện tại (luôn story) khi field vắng.
 */
export function resolveMontageEngine(job: Pick<EntJob, 'storyEngine'>): 'story' | 'anchors' {
  return job.storyEngine === 'anchors' ? 'anchors' : 'story';
}

/**
 * Engine montage copy từ CHANNEL vào job lúc tạo (per-channel). DEFENSIVE: chỉ
 * 'anchors' tường minh mới ra 'anchors'; channel null / thiếu / giá trị lạ → 'story'
 * (safe default — khớp guard lớp config coerceChannel). Round safe-mode: config để
 * toàn 'story' nên không job nào nhận anchors (anchors engine vẫn defer).
 */
export function jobStoryEngineFor(
  channel: Pick<EntChannel, 'storyEngine'> | null,
): 'story' | 'anchors' {
  return channel?.storyEngine === 'anchors' ? 'anchors' : 'story';
}

/**
 * Có step pipeline nào đang chạy không? (read-only wrapper của findRunningStep
 * cho Trend Scout — scout dùng chung Douyin browser profile với intake/fetch nên
 * không được chạy song song với step).
 */
export function anyEntStepRunning(): { jobId: string; step: EntStepName } | null {
  return findRunningStep();
}

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

  // Lane Giải trí dùng STORY engine (hook teaser 0–5s, cold-open Hook Style Bank,
  // seg-floor chống title intro, cấu trúc kể chuyện). Bật lane-scoped ngay tại spawn
  // — KHÔNG set .env global. Engine lấy PER-JOB từ manifest (resolveMontageEngine):
  // thiếu field → 'story' (mặc định lane). Thiếu cờ này pipeline rơi về "anchors" cũ.
  const { pid } = runRepoScriptDetached(
    PIPELINE_SCRIPT_REL,
    ['--id', id, '--step', step, '--model', SCRIPT_MODEL],
    logPath,
    { ENT_MONTAGE_ENGINE: resolveMontageEngine(job) },
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

/* ── Phase 3 — TikTok publish wiring (đăng tự động + caption tự động) ─────────
 * Real deps cho publish.ts (pure/DI). Đọc env server-side, KHÔNG log/return
 * token. Live publish phải bật TIKTOK_PUBLISH_LIVE=true (No-Go #2) — round 1
 * mặc định mock, chưa bật live.
 * ========================================================================== */

type TikTokConfig =
  | { ok: true; mode: 'mock'; isMock: true }
  | { ok: true; mode: 'display' | 'business'; isMock: false; accessToken: string }
  | {
      ok: false;
      code: 'TIKTOK_DISABLED' | 'TIKTOK_NOT_CONFIGURED' | 'LIVE_NOT_ENABLED';
      message: string;
    };

function parseTikTokMode(): 'disabled' | 'mock' | 'display' | 'business' {
  const m = (process.env.TIKTOK_MODE || '').trim().toLowerCase();
  if (m === 'mock') return 'mock';
  if (m === 'display') return 'display';
  if (m === 'business') return 'business';
  return 'disabled';
}

/** Resolve cấu hình TikTok từ env. token CHỈ dùng nội bộ build client, KHÔNG ra ngoài. */
function resolveTikTokConfig(): TikTokConfig {
  const mode = parseTikTokMode();
  if (mode === 'disabled') {
    return {
      ok: false,
      code: 'TIKTOK_DISABLED',
      message: 'TikTok đang tắt (TIKTOK_MODE=disabled).',
    };
  }
  if (mode === 'mock') return { ok: true, mode: 'mock', isMock: true };

  const clientKey = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  const clientSecret = (process.env.TIKTOK_CLIENT_SECRET || '').trim();
  const token =
    mode === 'display'
      ? (process.env.TIKTOK_ACCESS_TOKEN || '').trim()
      : (process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || '').trim();
  const missing: string[] = [];
  if (!clientKey) missing.push('TIKTOK_CLIENT_KEY');
  if (!clientSecret) missing.push('TIKTOK_CLIENT_SECRET');
  if (!token) {
    missing.push(mode === 'display' ? 'TIKTOK_ACCESS_TOKEN' : 'TIKTOK_BUSINESS_ACCESS_TOKEN');
  }
  if (mode === 'display' && !(process.env.TIKTOK_OPEN_ID || '').trim())
    missing.push('TIKTOK_OPEN_ID');
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'TIKTOK_NOT_CONFIGURED',
      message: `Thiếu cấu hình TikTok: ${missing.join(', ')}.`,
    };
  }
  if ((process.env.TIKTOK_PUBLISH_LIVE || '').trim().toLowerCase() !== 'true') {
    return {
      ok: false,
      code: 'LIVE_NOT_ENABLED',
      message:
        'Đăng TikTok thật chưa được bật (đặt TIKTOK_PUBLISH_LIVE=true khi Operator cho lệnh).',
    };
  }
  return { ok: true, mode, isMock: false, accessToken: token };
}

/**
 * G4 — Resolve client THEO accountId (multi-channel). Token từ account-store
 * (data/secure store, fallback .env legacy). KHÔNG theo "kênh đang chọn" UI.
 */
function resolveTikTokClientForAccount(accountId: string): ResolveClientResult {
  const mode = parseTikTokMode();
  if (mode === 'disabled') {
    return {
      ok: false,
      code: 'TIKTOK_DISABLED',
      message: 'TikTok đang tắt (TIKTOK_MODE=disabled).',
    };
  }
  if (mode === 'mock') {
    return { ok: true, client: createMockTikTokPublishClient(), mode: 'mock' };
  }
  const clientKey = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  const tokens = getAccountTokens(accountId);
  if (!clientKey || !tokens?.accessToken) {
    const missing = [
      !clientKey ? 'TIKTOK_CLIENT_KEY' : null,
      !tokens?.accessToken ? `token account ${accountId}` : null,
    ].filter(Boolean);
    return {
      ok: false,
      code: 'TIKTOK_NOT_CONFIGURED',
      message: `Thiếu cấu hình TikTok: ${missing.join(', ')}.`,
    };
  }
  if (isAccountTokenExpired(accountId)) {
    return {
      ok: false,
      code: 'TIKTOK_AUTH_EXPIRED',
      message: `Token account ${accountId} đã hết hạn — refresh trước khi đăng.`,
    };
  }
  if ((process.env.TIKTOK_PUBLISH_LIVE || '').trim().toLowerCase() !== 'true') {
    return {
      ok: false,
      code: 'LIVE_NOT_ENABLED',
      message: 'Đăng TikTok thật chưa được bật (đặt TIKTOK_PUBLISH_LIVE=true).',
    };
  }
  return {
    ok: true,
    client: createTikTokPublishClient({ accessToken: tokens.accessToken, mode }),
    mode,
  };
}

/** tiktokApiReady cho 1 account (mock OK; live cần token account + bật live). Booleans only. */
function accountApiReady(accountId: string | null): boolean {
  if (!accountId) return false;
  return resolveTikTokClientForAccount(accountId).ok;
}

/**
 * G7 — token account có ĐÚNG là của @username kênh không (creator_info/query).
 * mock → bỏ qua; kênh chưa pin username → không chặn. KHÔNG log token.
 */
async function verifyTikTokIdentity(
  accountId: string,
  expectedUsername: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (parseTikTokMode() === 'mock') return { ok: true };
  const tokens = getAccountTokens(accountId);
  if (!tokens?.accessToken) return { ok: false, reason: 'no-token' };
  if (!expectedUsername) return { ok: true };
  const live = await queryCreatorUsername(tokens.accessToken);
  if (!live.ok) return { ok: false, reason: 'creator_info_failed' };
  if (!live.username) return { ok: false, reason: 'no_username' };
  return live.username.toLowerCase() === expectedUsername.toLowerCase()
    ? { ok: true }
    : { ok: false, reason: `@${live.username} != @${expectedUsername}` };
}

/** Env TikTok legacy đã sẵn sàng (giữ cho tương thích — multi-channel dùng accountApiReady). */
export function tiktokEnvReady(): boolean {
  return resolveTikTokConfig().ok;
}

/** View tối giản cho publish (từ manifest + artifact thật). */
function buildPublishView(id: string): PublishJobView | null {
  const detail = getJobDetail(id);
  if (!detail) return null;
  const pkg = detail.package;
  const runningStep = anyStepRunning(id);
  // Bind kênh: ưu tiên manifest; job cũ chưa bind → suy từ niche (migration nhẹ).
  const channel = resolveChannelForJob({ channelId: detail.channelId, niche: detail.niche });
  return {
    jobId: id,
    state: detail.state,
    channelId: detail.channelId ?? channel?.channelId ?? null,
    accountId: detail.accountId ?? channel?.accountId ?? null,
    niche: detail.niche ?? null,
    previewApproved: detail.reviewGates?.previewApproved === true,
    finalVideoAbsPath: previewVideoPath(id),
    caption: pkg?.caption ?? '',
    hashtags: pkg?.hashtags ?? [],
    tiktokStatus: detail.tiktok?.status ?? null,
    tiktokStartedAt: detail.tiktok?.startedAt ?? null,
    pipelineBusyReason: runningStep ? `Đang chạy "${runningStep}" — chờ xong rồi đăng.` : null,
  };
}

/** 5 đèn readiness cho UI (không token/secret). tiktokApiReady theo account bind. */
export function getTikTokReadiness(id: string): EntTikTokReadiness | null {
  const view = buildPublishView(id);
  if (!view) return null;
  return computeReadiness(view, accountApiReady(view.accountId));
}

export interface EntJobChannelInfo {
  channelId: string | null;
  accountId: string | null;
  channelName: string | null;
  tiktokUsername: string | null;
  status: 'active' | 'inactive' | null;
  accountConfigured: boolean;
}

/** Thông tin kênh/account đích của job cho UI card "Đăng lên TikTok" — KHÔNG token. */
export function getJobChannelInfo(id: string): EntJobChannelInfo | null {
  const detail = getJobDetail(id);
  if (!detail) return null;
  const ch = resolveChannelForJob({ channelId: detail.channelId, niche: detail.niche });
  return {
    channelId: detail.channelId ?? ch?.channelId ?? null,
    accountId: detail.accountId ?? ch?.accountId ?? null,
    channelName: ch?.channelName ?? null,
    tiktokUsername: ch?.tiktokUsername ?? null,
    status: ch?.status ?? null,
    accountConfigured: ch ? accountConfigured(ch.accountId) : false,
  };
}

/** Resolve channelId của 1 job (manifest → fallback niche). Dùng cho filter/badge UI. */
function jobChannelId(job: EntJob): string | null {
  return job.channelId ?? resolveChannelForJob({ niche: job.niche })?.channelId ?? null;
}

export interface EntJobUi {
  jobId: string;
  state: string;
  source?: { url?: string; durationSec?: number };
  channelId: string | null;
  channelName: string | null;
  tiktokUsername: string | null;
}

/** Job list cho UI — kèm kênh đã resolve (badge + filter theo kênh). KHÔNG token. */
export function listJobsForUi(): EntJobUi[] {
  return listJobs().map((j) => {
    const ch = resolveChannelForJob({ channelId: j.channelId, niche: j.niche });
    return {
      jobId: j.jobId,
      state: j.state,
      source: j.source ? { url: j.source.url, durationSec: j.source.durationSec } : undefined,
      channelId: j.channelId ?? ch?.channelId ?? null,
      channelName: ch?.channelName ?? null,
      tiktokUsername: ch?.tiktokUsername ?? null,
    };
  });
}

export interface EntChannelUi {
  channelId: string;
  channelName: string;
  niche: string;
  tiktokUsername: string;
  tiktokDisplayName: string | null;
  status: 'active' | 'inactive';
  avatar: string | null;
  accountConfigured: boolean;
  jobCount: number;
  postedToday: number;
  /** Kênh nguồn TQ đã gắn? (URL không lộ ra client — chỉ platform/label cho badge). */
  hasSourceChannel: boolean;
  sourcePlatform: 'douyin' | 'tiktok' | null;
  sourceLabel: string | null;
  /** Engine montage mặc định của kênh (read-only UI). Thiếu → 'story'. */
  storyEngine: 'story' | 'anchors';
}

/** Channels cho UI Switcher/Overview — kèm jobCount + postedToday + accountConfigured. KHÔNG token. */
export function listChannelsForUi(): EntChannelUi[] {
  const jobs = listJobs();
  const today = nowIso().slice(0, 10);
  return listChannels().map((c) => {
    const chJobs = jobs.filter((j) => jobChannelId(j) === c.channelId);
    const postedToday = chJobs.filter(
      (j) => j.tiktok?.status === 'POSTED' && (j.tiktok.postedAt ?? '').slice(0, 10) === today,
    ).length;
    return {
      channelId: c.channelId,
      channelName: c.channelName,
      niche: c.niche,
      tiktokUsername: c.tiktokUsername,
      tiktokDisplayName: c.tiktokDisplayName ?? null,
      status: c.status,
      avatar: c.avatar ?? null,
      accountConfigured: accountConfigured(c.accountId),
      jobCount: chJobs.length,
      postedToday,
      hasSourceChannel: !!c.sourceChannel,
      sourcePlatform: c.sourceChannel?.platform ?? null,
      sourceLabel: c.sourceChannel?.label ?? null,
      storyEngine: c.storyEngine ?? 'story',
    };
  });
}

/** Ghi tiktok summary + state vào manifest + trace file runtime (no token). */
export function setTikTokStatus(id: string, summary: EntTikTokPublishSummary): EntJob | null {
  const job = readManifest(id);
  if (!job) return null;
  const state: EntJobState =
    summary.status === 'POSTED'
      ? 'TIKTOK_POSTED'
      : summary.status === 'POSTING'
        ? 'TIKTOK_POSTING'
        : 'TIKTOK_FAILED';
  writeManifest(id, { ...job, tiktok: summary, state, updatedAt: nowIso() });
  const tracePath = entFile(id, 'montage_v2/tiktok_publish.json');
  if (tracePath) {
    try {
      mkdirSync(join(tracePath, '..'), { recursive: true });
      writeFileSync(tracePath, JSON.stringify(summary, null, 2));
    } catch {
      /* trace là phụ — không chặn flow */
    }
  }
  return getJobDetail(id);
}

/** Ghi caption (đã sửa) + hashtag vào package.json trước khi đăng — proof caption cuối. */
export function saveCaptionToPackage(id: string, caption: string, hashtags: string[]): void {
  const p = entFile(id, 'montage_v2/package.json');
  if (!p || !existsSync(p)) return;
  try {
    const pkg = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    const prev = typeof pkg.caption === 'string' ? pkg.caption : '';
    pkg.caption = caption;
    pkg.hashtags = hashtags;
    if (caption !== prev) pkg.captionSource = 'operator-edited';
    writeFileSync(p, JSON.stringify(pkg, null, 2));
  } catch {
    /* giữ nguyên nếu lỗi đọc/ghi */
  }
}

/** Deps thật cho publishToTikTok (publish.ts là pure/DI). */
export function buildPublishDeps(): PublishDeps {
  return {
    loadJob: (id) => buildPublishView(id),
    loadChannel: (channelId) => {
      const ch = getChannel(channelId);
      if (!ch) return null;
      return {
        channelId: ch.channelId,
        accountId: ch.accountId,
        niche: ch.niche,
        tiktokUsername: ch.tiktokUsername,
        status: ch.status,
        allowedContentTypes: ch.allowedContentTypes,
        topicMismatchPolicy: ch.guardPolicy.topicMismatch,
      };
    },
    saveCaption: (id, caption, hashtags) => saveCaptionToPackage(id, caption, hashtags),
    setStatus: (id, summary) => {
      setTikTokStatus(id, summary);
    },
    resolveClientForAccount: (accountId) => resolveTikTokClientForAccount(accountId),
    verifyAccountIdentity: (accountId, expectedUsername) =>
      verifyTikTokIdentity(accountId, expectedUsername),
    now: () => nowIso(),
  };
}

// ── Facebook publish (lane Giải trí đổi target TikTok → Facebook) ──────────────

/** Mock FB client — mô phỏng POSTED, KHÔNG gọi Graph. Cho vòng mock/dev. */
function createMockFacebookClient(): FacebookPublishClient {
  return {
    async publishReel(_input) {
      const ts = Date.now();
      return {
        ok: true,
        mode: 'mock',
        videoId: `mock_fb_${ts}`,
        permalinkUrl: `https://www.facebook.com/reel/mock_${ts}`,
        publishVisibility: 'UNCONFIRMED',
      };
    },
  };
}

/** Live FB client — bọc publishReelToPage (Graph v22, có mode-gate META_MODE=live). */
function createLiveFacebookClient(pageId: string, token: string): FacebookPublishClient {
  return {
    async publishReel(input) {
      const res = await publishReelToPage(pageId, token, {
        videoFilePath: input.videoPath,
        description: input.description,
      });
      if (res.success) {
        return {
          ok: true,
          mode: 'live',
          videoId: res.videoId,
          permalinkUrl: res.permalinkUrl,
          publishVisibility: 'UNCONFIRMED',
        };
      }
      return {
        ok: false,
        mode: 'live',
        videoId: res.videoId,
        error: { code: res.phase, message: res.error ?? 'Facebook publish failed.' },
      };
    },
  };
}

/**
 * Resolve FB client. Mặc định (META_MODE ≠ live) → mock (KHÔNG gọi Graph). Live
 * cần META_MODE=live + VFOS_STUDIO_ALLOW_LIVE_PUBLISH=true + credential page
 * (ENT_FACEBOOK_* ưu tiên, fallback FACEBOOK_*).
 */
function resolveFacebookClient(): ResolveFbClientResult {
  const metaMode = (process.env.META_MODE ?? '').trim().toLowerCase();
  if (metaMode !== 'live') {
    return { ok: true, client: createMockFacebookClient(), mode: 'mock' };
  }
  if ((process.env.VFOS_STUDIO_ALLOW_LIVE_PUBLISH ?? '').trim().toLowerCase() !== 'true') {
    return {
      ok: false,
      code: 'LIVE_NOT_ENABLED',
      message: 'Đăng Facebook thật chưa bật (đặt VFOS_STUDIO_ALLOW_LIVE_PUBLISH=true).',
    };
  }
  const pageId = (process.env.ENT_FACEBOOK_PAGE_ID || process.env.FACEBOOK_PAGE_ID || '').trim();
  const token = (
    process.env.ENT_FACEBOOK_PAGE_ACCESS_TOKEN ||
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN ||
    ''
  ).trim();
  if (!pageId || !token) {
    return {
      ok: false,
      code: 'FACEBOOK_NOT_CONFIGURED',
      message: 'Thiếu ENT_FACEBOOK_PAGE_ID / ENT_FACEBOOK_PAGE_ACCESS_TOKEN cho lane Giải trí.',
    };
  }
  return { ok: true, client: createLiveFacebookClient(pageId, token), mode: 'live' };
}

/** View tối giản cho FB publish (từ manifest + artifact thật). */
function buildFacebookPublishView(id: string): FacebookPublishJobView | null {
  const detail = getJobDetail(id);
  if (!detail) return null;
  const pkg = detail.package;
  const runningStep = anyStepRunning(id);
  return {
    jobId: id,
    state: detail.state,
    previewApproved: detail.reviewGates?.previewApproved === true,
    finalVideoAbsPath: previewVideoPath(id),
    caption: pkg?.caption ?? '',
    hashtags: pkg?.hashtags ?? [],
    facebookStatus: detail.facebook?.status ?? null,
    facebookStartedAt: detail.facebook?.startedAt ?? null,
    pipelineBusyReason: runningStep ? `Đang chạy "${runningStep}" — chờ xong rồi đăng.` : null,
  };
}

/** 4 đèn readiness cho UI card "Đăng lên Facebook" — KHÔNG token. */
export function getFacebookReadiness(id: string): EntFacebookReadiness | null {
  const view = buildFacebookPublishView(id);
  if (!view) return null;
  return computeFacebookReadiness(view, resolveFacebookClient().ok);
}

/** Ghi facebook summary vào manifest + trace file runtime (no token). KHÔNG đổi state. */
export function setFacebookStatus(id: string, summary: EntFacebookPublishSummary): EntJob | null {
  const job = readManifest(id);
  if (!job) return null;
  writeManifest(id, { ...job, facebook: summary, updatedAt: nowIso() });
  const tracePath = entFile(id, 'montage_v2/facebook_publish.json');
  if (tracePath) {
    try {
      mkdirSync(join(tracePath, '..'), { recursive: true });
      writeFileSync(tracePath, JSON.stringify(summary, null, 2));
    } catch {
      /* trace là phụ — không chặn flow */
    }
  }
  return getJobDetail(id);
}

/** Deps thật cho publishToFacebook (facebook-publish.ts là pure/DI). */
export function buildFacebookPublishDeps(): FacebookPublishDeps {
  return {
    loadJob: (id) => buildFacebookPublishView(id),
    saveCaption: (id, caption, hashtags) => saveCaptionToPackage(id, caption, hashtags),
    setStatus: (id, summary) => {
      setFacebookStatus(id, summary);
    },
    resolveClient: () => resolveFacebookClient(),
    now: () => nowIso(),
  };
}
