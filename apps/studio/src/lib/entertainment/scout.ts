/* =============================================================================
 * VFOS Studio — Trend Scout server lib (SERVER ONLY)
 * -----------------------------------------------------------------------------
 * Đọc snapshot + run-state của Trend Scout (CLI scripts/ent-vlog/30-scout.ts) cho
 * panel trong Action 1 "Tải link" lane Giải trí, và khởi chạy quét DETACHED.
 *
 * - Snapshot tường minh theo runId (KHÔNG floating "latest" làm source of truth —
 *   API luôn trả runId đang xem; "mới nhất" chỉ là default chọn của UI).
 * - Pure-read các hàm list/read (mirror status.ts). startScoutRun là hàm DUY NHẤT
 *   có side-effect: spawn CLI + ghi run-state khởi điểm.
 * - Guard: KHÔNG chạy scout khi scout khác đang chạy hoặc khi có step pipeline
 *   đang chạy (scout dùng chung Douyin browser profile với intake/fetch).
 * - Scout là READ-ONLY discovery: KHÔNG tạo job — promote đi qua POST
 *   /api/studio/entertainment/jobs có sẵn (409 dedup guard).
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScriptDetached } from '@/lib/studio-data/run-command';
import { anyEntStepRunning, findLivingJobBySourceKey } from './jobs';

const SCOUT_DIR_REL = 'data/temp/ent/scout';
const SCOUT_SCRIPT_REL = 'scripts/ent-vlog/30-scout.ts';
const RUN_ID_RE = /^scout_[a-z0-9-]+_\d{8}_\d{6}$/;
const NICHE_RE = /^[a-z0-9-]+$/;

// --- Kiểu dữ liệu (projection của snapshot CLI — schemaVersion 1) -------------

export interface ScoutRunStateUi {
  state: 'idle' | 'running' | 'done' | 'captcha' | 'failed';
  runId: string | null;
  niche: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  snapshotRunId: string | null;
  message: string | null;
}

export interface ScoutNicheUi {
  niche: string;
  label: string;
  keywordCount: number;
}

export interface ScoutSnapshotMetaUi {
  runId: string;
  niche: string;
  startedAt: string;
  status: string;
  candidateCount: number;
}

export interface ScoutCandidateUi {
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

export interface ScoutSnapshotUi {
  runId: string;
  niche: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  keywordsCompleted: number;
  keywordCount: number;
  rejectedCounts: { tooOld: number; tooNew: number; noTimestamp: number; belowFloor: number };
  domOnlyCount: number;
  candidates: ScoutCandidateUi[];
}

function readJsonSafe<T>(absPath: string | null): T | null {
  if (!absPath || !existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Process còn sống? (mirror isPidAlive của jobs.ts — private nên nhân bản tối giản). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// --- Niches (config/scout/*.json — committed) ---------------------------------

interface ScoutConfigLite {
  niche?: string;
  label?: string;
  keywords?: unknown;
}

/** Các bộ scout config khả dụng cho dropdown chọn niche. */
export function listScoutNiches(): ScoutNicheUi[] {
  const dir = resolveInsideRepo('config/scout');
  if (!dir || !existsSync(dir)) return [];
  const out: ScoutNicheUi[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const cfg = readJsonSafe<ScoutConfigLite>(join(dir, entry.name));
    const niche = typeof cfg?.niche === 'string' ? cfg.niche : null;
    if (!niche || !NICHE_RE.test(niche)) continue;
    out.push({
      niche,
      label: typeof cfg?.label === 'string' ? cfg.label : niche,
      keywordCount: Array.isArray(cfg?.keywords) ? cfg.keywords.length : 0,
    });
  }
  return out.sort((a, b) => a.niche.localeCompare(b.niche));
}

// --- Run-state ------------------------------------------------------------------

interface ScoutRunStateFile {
  state?: string;
  pid?: number;
  runId?: string;
  niche?: string;
  startedAt?: string;
  finishedAt?: string;
  snapshotPath?: string;
  message?: string;
}

/** Run-state cho UI poll — có stale-pid check (running mà process chết → failed). */
export function readScoutRunState(): ScoutRunStateUi {
  const raw = readJsonSafe<ScoutRunStateFile>(resolveInsideRepo(`${SCOUT_DIR_REL}/scout_run.json`));
  if (!raw || typeof raw.state !== 'string') {
    return {
      state: 'idle',
      runId: null,
      niche: null,
      startedAt: null,
      finishedAt: null,
      snapshotRunId: null,
      message: null,
    };
  }
  let state: ScoutRunStateUi['state'] =
    raw.state === 'running' || raw.state === 'done' || raw.state === 'captcha'
      ? raw.state
      : 'failed';
  let message = typeof raw.message === 'string' ? raw.message : null;
  if (state === 'running' && (typeof raw.pid !== 'number' || !pidAlive(raw.pid))) {
    state = 'failed';
    message = 'Tiến trình quét đã dừng bất thường (process không còn chạy).';
  }
  // snapshotPath dạng rel "data/temp/ent/scout/<runId>.json" → runId tường minh.
  const snapMatch =
    typeof raw.snapshotPath === 'string'
      ? raw.snapshotPath.match(/(scout_[a-z0-9-]+_\d{8}_\d{6})\.json$/)
      : null;
  return {
    state,
    runId: typeof raw.runId === 'string' ? raw.runId : null,
    niche: typeof raw.niche === 'string' ? raw.niche : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null,
    snapshotRunId: snapMatch?.[1] ?? null,
    message,
  };
}

// --- Snapshots (pure read) --------------------------------------------------------

interface ScoutSnapshotFile {
  schemaVersion?: number;
  runId?: string;
  niche?: string;
  startedAt?: string;
  finishedAt?: string;
  keywords?: unknown[];
  keywordsCompleted?: number;
  status?: string;
  rejectedCounts?: { tooOld?: number; tooNew?: number; noTimestamp?: number; belowFloor?: number };
  domOnlyIds?: unknown[];
  candidates?: Array<Record<string, unknown>>;
}

function snapshotPathFor(runId: string): string | null {
  if (!RUN_ID_RE.test(runId)) return null; // chống path traversal
  return resolveInsideRepo(`${SCOUT_DIR_REL}/${runId}.json`);
}

/** Danh sách snapshot (meta) — mới nhất trước. */
export function listScoutSnapshots(): ScoutSnapshotMetaUi[] {
  const dir = resolveInsideRepo(SCOUT_DIR_REL);
  if (!dir || !existsSync(dir)) return [];
  const out: ScoutSnapshotMetaUi[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const runId = entry.name.slice(0, -'.json'.length);
    if (!RUN_ID_RE.test(runId)) continue; // scout_run.json và file lạ bị loại ở đây
    const snap = readJsonSafe<ScoutSnapshotFile>(join(dir, entry.name));
    if (!snap || snap.schemaVersion !== 1) continue;
    out.push({
      runId,
      niche: typeof snap.niche === 'string' ? snap.niche : 'unknown',
      startedAt: typeof snap.startedAt === 'string' ? snap.startedAt : '',
      status: typeof snap.status === 'string' ? snap.status : 'OK',
      candidateCount: Array.isArray(snap.candidates) ? snap.candidates.length : 0,
    });
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Đọc 1 snapshot theo runId tường minh. Cờ alreadyJobbed được TÍNH LẠI lúc đọc
 * (snapshot có thể cũ — Operator vừa promote xong thì cờ phải bật ngay).
 */
export function readScoutSnapshotForUi(runId: string): ScoutSnapshotUi | null {
  const p = snapshotPathFor(runId);
  const snap = readJsonSafe<ScoutSnapshotFile>(p);
  if (!snap || snap.schemaVersion !== 1) return null;
  const candidates: ScoutCandidateUi[] = [];
  for (const c of snap.candidates ?? []) {
    const url = str(c.url);
    const awemeId = str(c.awemeId);
    if (!url || !awemeId) continue;
    const author =
      typeof c.author === 'object' && c.author !== null
        ? (c.author as Record<string, unknown>)
        : {};
    const storedJobbed = c.alreadyJobbed === true;
    candidates.push({
      awemeId,
      url,
      desc: str(c.desc),
      ageMinutes: num(c.ageMinutes),
      diggCount: num(c.diggCount),
      commentCount: num(c.commentCount),
      likesPerMinute: num(c.likesPerMinute),
      score: num(c.score),
      signals: Array.isArray(c.signals)
        ? c.signals.filter((s): s is string => typeof s === 'string')
        : [],
      reason: str(c.reason),
      alreadyJobbed: storedJobbed || findLivingJobBySourceKey(url) !== null,
      authorNickname: typeof author.nickname === 'string' ? author.nickname : null,
      durationSec: typeof c.durationSec === 'number' ? c.durationSec : null,
      keyword: str(c.keyword),
    });
  }
  return {
    runId,
    niche: str(snap.niche) || 'unknown',
    startedAt: str(snap.startedAt),
    finishedAt: str(snap.finishedAt),
    status: str(snap.status) || 'OK',
    keywordsCompleted: num(snap.keywordsCompleted),
    keywordCount: Array.isArray(snap.keywords) ? snap.keywords.length : 0,
    rejectedCounts: {
      tooOld: num(snap.rejectedCounts?.tooOld),
      tooNew: num(snap.rejectedCounts?.tooNew),
      noTimestamp: num(snap.rejectedCounts?.noTimestamp),
      belowFloor: num(snap.rejectedCounts?.belowFloor),
    },
    domOnlyCount: Array.isArray(snap.domOnlyIds) ? snap.domOnlyIds.length : 0,
    candidates,
  };
}

// --- Start run (side-effect duy nhất) ----------------------------------------------

export type StartScoutResult =
  | { ok: true; pid: number | null }
  | {
      ok: false;
      code: 'UNKNOWN_NICHE' | 'SCOUT_RUNNING' | 'STEP_RUNNING' | 'SPAWN_FAILED';
      message: string;
    };

/**
 * Spawn `ent:scout --niche <niche>` DETACHED (mirror startStep). Ghi run-state
 * 'running' NGAY để chặn double-POST trước khi CLI kịp tự ghi (CLI sẽ ghi đè
 * bằng đúng shape đó kèm runId thật).
 */
export function startScoutRun(niche: string): StartScoutResult {
  if (!NICHE_RE.test(niche) || !listScoutNiches().some((n) => n.niche === niche)) {
    return {
      ok: false,
      code: 'UNKNOWN_NICHE',
      message: `Không có config scout cho niche "${niche}".`,
    };
  }
  const runState = readScoutRunState();
  if (runState.state === 'running') {
    return {
      ok: false,
      code: 'SCOUT_RUNNING',
      message: `Đang quét (${runState.niche ?? '?'}, bắt đầu ${runState.startedAt ?? '?'}). Chờ xong rồi quét tiếp.`,
    };
  }
  const step = anyEntStepRunning();
  if (step) {
    return {
      ok: false,
      code: 'STEP_RUNNING',
      message: `Hệ thống đang chạy "${step.step}" cho job ${step.jobId} — scout dùng chung trình duyệt Douyin, chờ xong rồi quét.`,
    };
  }

  const scoutDirAbs = resolveInsideRepo(SCOUT_DIR_REL);
  if (!scoutDirAbs) {
    return { ok: false, code: 'SPAWN_FAILED', message: 'Không resolve được thư mục scout.' };
  }
  mkdirSync(scoutDirAbs, { recursive: true });
  const logAbs = join(scoutDirAbs, 'scout_run.log');
  try {
    const { pid } = runRepoScriptDetached(SCOUT_SCRIPT_REL, ['--niche', niche], logAbs);
    // Ghi running NGAY (chặn double-POST trong khoảng CLI khởi động).
    writeFileSync(
      join(scoutDirAbs, 'scout_run.json'),
      JSON.stringify(
        {
          state: 'running',
          pid: pid ?? -1,
          runId: `scout_${niche}_pending`,
          niche,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return { ok: true, pid: pid ?? null };
  } catch (e) {
    return {
      ok: false,
      code: 'SPAWN_FAILED',
      message: `Không khởi chạy được scout: ${e instanceof Error ? e.message : String(e)}`.slice(
        0,
        280,
      ),
    };
  }
}
