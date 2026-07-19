/* =============================================================================
 * VFOS — Publish tick STORE (Phần 82, R-B) — I/O cho state file của máy tick.
 * -----------------------------------------------------------------------------
 * Toàn bộ file trạng thái của máy tick nằm trong data/growth/runtime/ (gitignored,
 * cùng chỗ các runtime store khác — KHÔNG commit):
 *   publish-schedule.json  — lịch slot (nguồn sự thật bind→fire), atomic tmp→rename.
 *   publish-board.json      — bảng theo dõi READ-ONLY cho UI (tick ghi, UI đọc).
 *   publish-audit.jsonl     — nhật ký append mọi bind/fire/skip/block (truy vết).
 *   publish-tick.lock       — single-flight; stale>10min thì tick sau tiếp quản.
 *   publish-halt.json       — phanh tổng; tồn tại & active!==false → tick dừng ngay.
 * Never-throw ở đọc; ghi atomic. KHÔNG đụng token, KHÔNG log secret.
 * ========================================================================== */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  PUBLISH_SCHEDULE_SCHEMA_VERSION,
  type PublishScheduleFile,
  type PublishSlot,
} from './publish-schedule.js';

const RUNTIME_DIR = join('data', 'growth', 'runtime');
const SCHEDULE_REL = join(RUNTIME_DIR, 'publish-schedule.json');
const BOARD_REL = join(RUNTIME_DIR, 'publish-board.json');
const AUDIT_REL = join(RUNTIME_DIR, 'publish-audit.jsonl');
const LOCK_REL = join(RUNTIME_DIR, 'publish-tick.lock');
const HALT_REL = join(RUNTIME_DIR, 'publish-halt.json');

/** Repo root: leo lên tới thư mục có pnpm-workspace.yaml; fallback cwd. */
export function repoRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export function resolveRepo(rel: string, root: string = repoRoot()): string {
  return join(root, rel);
}

function atomicWrite(abs: string, content: string): void {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, abs);
}

/* ── Schedule store ──────────────────────────────────────────────────────── */

function emptySchedule(): PublishScheduleFile {
  return {
    schemaVersion: PUBLISH_SCHEDULE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    slots: [],
  };
}

/** Đọc lịch. Never-throw → empty nếu thiếu/hỏng/sai shape. */
export function readSchedule(root: string = repoRoot()): PublishScheduleFile {
  const p = resolveRepo(SCHEDULE_REL, root);
  if (!existsSync(p)) return emptySchedule();
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptySchedule();
    const obj = parsed as Partial<PublishScheduleFile>;
    if (!Array.isArray(obj.slots)) return emptySchedule();
    return {
      schemaVersion:
        typeof obj.schemaVersion === 'number' ? obj.schemaVersion : PUBLISH_SCHEDULE_SCHEMA_VERSION,
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
      slots: obj.slots as PublishSlot[],
    };
  } catch {
    return emptySchedule();
  }
}

export function writeSchedule(slots: PublishSlot[], root: string = repoRoot()): void {
  const file: PublishScheduleFile = {
    schemaVersion: PUBLISH_SCHEDULE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    slots,
  };
  atomicWrite(resolveRepo(SCHEDULE_REL, root), JSON.stringify(file, null, 2));
}

/* ── Board (UI read-only) ────────────────────────────────────────────────── */

export function writeBoard(board: unknown, root: string = repoRoot()): void {
  atomicWrite(resolveRepo(BOARD_REL, root), JSON.stringify(board, null, 2));
}

/* ── Audit (append-only JSONL) ───────────────────────────────────────────── */

export interface AuditEntry {
  at: string;
  event: 'bind' | 'fire' | 'skip' | 'block' | 'refresh' | 'halt' | 'tick';
  slotId?: string | undefined;
  jobId?: string | undefined;
  targetId?: string | undefined;
  detail?: string | undefined;
}

/** Append 1 dòng audit. Best-effort — lỗi ghi không chặn tick. */
export function appendAudit(entry: AuditEntry, root: string = repoRoot()): void {
  try {
    const abs = resolveRepo(AUDIT_REL, root);
    mkdirSync(dirname(abs), { recursive: true });
    appendFileSync(abs, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* audit là phụ */
  }
}

/* ── Halt (phanh tổng) ───────────────────────────────────────────────────── */

/** Có đang HALT? File tồn tại và active !== false → dừng tick. */
export function isHalted(root: string = repoRoot()): boolean {
  const p = resolveRepo(HALT_REL, root);
  if (!existsSync(p)) return false;
  try {
    const obj = JSON.parse(readFileSync(p, 'utf8')) as { active?: unknown };
    return obj?.active !== false; // tồn tại = mặc định HALT, trừ khi active:false
  } catch {
    return true; // file hỏng → HALT cho an toàn (fail-safe)
  }
}

/* ── Lock (single-flight, stale takeover) ────────────────────────────────── */

interface LockBody {
  pid: number;
  startedAt: number;
}

/** Process pid còn sống? (liveness cross-process; false nếu đã chết). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cố gắng chiếm lock. Trả true nếu chiếm được (ghi pid+ts).
 *
 * Chống race "tiếp quản nhầm tick đang chạy khỏe" (adversarial review R-B): CHỈ
 * nhường (return false) khi holder CÒN SỐNG (pid alive) VÀ còn hạn (age < staleMs).
 * pid CHẾT (crash) → tiếp quản ngay; hung quá staleMs (backstop cho pid reuse) →
 * tiếp quản. Nhờ vậy một tick chạy live lâu (2 fire tuần tự) KHÔNG bị tick sau
 * cướp lock giữa chừng. staleMs phải > tổng thời gian fire tối đa (xem tick).
 */
export function acquireLock(nowMs: number, staleMs: number, root: string = repoRoot()): boolean {
  const p = resolveRepo(LOCK_REL, root);
  if (existsSync(p)) {
    try {
      const body = JSON.parse(readFileSync(p, 'utf8')) as Partial<LockBody>;
      const started = typeof body.startedAt === 'number' ? body.startedAt : 0;
      const pid = typeof body.pid === 'number' ? body.pid : 0;
      const fresh = nowMs - started < staleMs;
      if (pid > 0 && pidAlive(pid) && fresh) return false; // holder đang chạy thật — nhường
      // pid chết (crash) HOẶC quá hạn backstop → tiếp quản.
    } catch {
      /* lock hỏng → coi như stale, tiếp quản */
    }
  }
  const lock: LockBody = { pid: process.pid, startedAt: nowMs };
  atomicWrite(p, JSON.stringify(lock));
  return true;
}

/**
 * Nhả lock — CHỈ khi lock trên đĩa là của chính process này (ownership check).
 * Chống xoá nhầm lock của tick đã tiếp quản (mở cửa sổ tick thứ 3). File hỏng/
 * thiếu → xoá cho sạch.
 */
export function releaseLock(root: string = repoRoot()): void {
  const p = resolveRepo(LOCK_REL, root);
  try {
    const body = JSON.parse(readFileSync(p, 'utf8')) as Partial<LockBody>;
    if (typeof body.pid === 'number' && body.pid !== process.pid) return; // không phải của mình
  } catch {
    /* unreadable/absent → xoá cho sạch */
  }
  try {
    rmSync(p, { force: true });
  } catch {
    /* release best-effort */
  }
}
