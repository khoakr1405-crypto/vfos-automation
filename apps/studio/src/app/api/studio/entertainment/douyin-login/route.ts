/* =============================================================================
 * VFOS Studio — Douyin re-login API (Phase A) — POST mở cửa sổ, GET poll trạng thái
 * -----------------------------------------------------------------------------
 * POST → spawn `scripts/ent-vlog/00-douyin-login.ts` DETACHED (headful, chờ
 * Operator ĐÓNG cửa sổ nên KHÔNG dùng runRepoScript sync 120s). Trả 202 ngay.
 * GET → đọc data/temp/douyin_login_status.json (do script ghi) + freshness check,
 * UI poll tới khi state='CLOSED' rồi tự tải lại job lỗi (auto-resume, Phase B).
 *
 * Guard: local-only + single-flight (login DÙNG CHUNG Douyin profile với intake/
 * scout/produce → 409 khi bận) + KHÔNG mở thêm nếu đã có cửa sổ đang mở. Chỉ chạy
 * khi Operator BẤM — KHÔNG tự mở khi phát hiện captcha/session chết (No-Go #4).
 * ========================================================================== */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { anyEntStepRunning } from '@/lib/entertainment/jobs';
import { readScoutRunState } from '@/lib/entertainment/scout';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScriptDetached } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

const STATUS_REL = 'data/temp/douyin_login_status.json';
const LOGIN_SCRIPT_REL = 'scripts/ent-vlog/00-douyin-login.ts';
const LOG_REL = 'data/temp/douyin_login.log';
// Status coi là còn hiệu lực trong 15' (chống UI đọc nhầm artifact lần login CŨ).
const FRESH_MS = 15 * 60_000;

interface LoginStatus {
  state: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  pid: number;
  generatedAt: string;
}

/** Đọc status JSON (contract với 00-douyin-login.ts); null nếu chưa có / hỏng. */
function readStatus(): LoginStatus | null {
  const p = resolveInsideRepo(STATUS_REL);
  if (!p) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      ((parsed as LoginStatus).state === 'OPEN' || (parsed as LoginStatus).state === 'CLOSED') &&
      typeof (parsed as LoginStatus).generatedAt === 'string'
    ) {
      return parsed as LoginStatus;
    }
  } catch {
    /* chưa có / JSON hỏng → null */
  }
  return null;
}

function isFresh(s: LoginStatus, nowMs: number): boolean {
  const t = Date.parse(s.generatedAt);
  if (Number.isNaN(t)) return false;
  const age = nowMs - t;
  return age <= FRESH_MS && age >= -5_000;
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  // Single-flight: login mở cửa sổ headful chiếm profile Douyin — không chạy song
  // song với intake/fetch/scout/produce (cùng profile → lock, hỏng cả hai).
  const step = anyEntStepRunning();
  if (step) {
    return Response.json(
      {
        ok: false,
        code: 'STEP_RUNNING',
        message: `Hệ thống đang chạy "${step.step}" cho job ${step.jobId} — dùng chung trình duyệt Douyin, chờ xong rồi đăng nhập lại.`,
      },
      { status: 409 },
    );
  }
  // Scout cũng dùng chung profile Douyin (spawn detached) → chặn login khi đang quét.
  if (readScoutRunState().state === 'running') {
    return Response.json(
      {
        ok: false,
        code: 'SCOUT_RUNNING',
        message:
          'Trend Scout đang quét (dùng chung trình duyệt Douyin) — chờ xong rồi đăng nhập lại.',
      },
      { status: 409 },
    );
  }
  const cur = readStatus();
  if (cur && cur.state === 'OPEN' && isFresh(cur, Date.now())) {
    return Response.json(
      {
        ok: false,
        code: 'LOGIN_ALREADY_OPEN',
        message: 'Cửa sổ đăng nhập Douyin đang mở — hoàn tất và ĐÓNG cửa sổ đó trước.',
      },
      { status: 409 },
    );
  }
  const logAbs = resolveInsideRepo(LOG_REL);
  const statusAbs = resolveInsideRepo(STATUS_REL);
  if (!logAbs || !statusAbs) {
    return Response.json({ ok: false, code: 'SPAWN_FAILED' }, { status: 500 });
  }
  try {
    mkdirSync(dirname(logAbs), { recursive: true });
    const { pid } = runRepoScriptDetached(LOGIN_SCRIPT_REL, [], logAbs);
    // Ghi status OPEN NGAY (pending, đồng bộ) để double-POST nhanh — trước khi child
    // 00-douyin-login.ts kịp ghi OPEN thật (vài giây sau khi cửa sổ mở) — thấy được
    // LOGIN_ALREADY_OPEN, không mở 2 cửa sổ (đóng khe TOCTOU). Cùng path/shape với
    // GET + child nên poll nhất quán.
    const now = new Date().toISOString();
    writeFileSync(
      statusAbs,
      `${JSON.stringify({ state: 'OPEN', openedAt: now, closedAt: null, pid: pid ?? -1, generatedAt: now }, null, 2)}\n`,
      'utf8',
    );
    return Response.json(
      {
        ok: true,
        pid: pid ?? -1,
        message:
          'Cửa sổ Douyin đang mở. Đăng nhập / giải captcha rồi ĐÓNG cửa sổ — hệ thống sẽ tự tải lại.',
      },
      { status: 202 },
    );
  } catch (e) {
    return Response.json(
      { ok: false, code: 'SPAWN_FAILED', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const s = readStatus();
  const fresh = s ? isFresh(s, Date.now()) : false;
  return Response.json({ ok: true, status: fresh ? s : null });
}
