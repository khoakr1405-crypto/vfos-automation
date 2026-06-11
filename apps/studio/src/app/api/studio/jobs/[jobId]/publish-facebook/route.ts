/* =============================================================================
 * VFOS Studio — Round UI-06: local-only guarded LIVE Facebook publish
 * -----------------------------------------------------------------------------
 * Nguyên tắc sống còn (mọi điều kiện đều bắt buộc, AND):
 *   Local-only mới được live publish. Không local-only → không publish.
 *   Không env flag → không publish. Không gate pass → không publish.
 *   Không confirm phrase → không publish. Không audit log → vẫn ghi trước khi chạy.
 *   Không bao giờ lộ token / raw path.
 *
 * Route KHÔNG reimplement publish logic — tái dùng command thật đã có:
 *   pnpm job:publish-facebook --job <jobId> --confirm-live-publish
 * Command đó tự có 14 preflight gate + tự mask token + tự ghi status/result.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import {
  appendPublishAuditLog,
  evaluateLivePublishGates,
  facebookCredentialsConfigured,
  isLivePublishEnvEnabled,
  livePublishConfirmPhrase,
  livePublishDisabledReason,
} from '@/lib/studio-data/jobs';
import { repoRoot, resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';
import type { LivePublishAuditRecord } from '@/lib/studio-data/types';

export const dynamic = 'force-dynamic';

const JOB_ID_RE = /^[A-Za-z0-9_-]+$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Local-only guard — bắt buộc. Block mọi host/origin không phải loopback. */
function isLocalOnly(req: Request): boolean {
  const host = (req.headers.get('host') || '').trim().toLowerCase();
  if (!host) return false;
  const hostname = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : (host.split(':')[0] ?? '');
  if (!LOCAL_HOSTS.has(hostname)) return false;

  // Nếu có Origin (request từ browser), origin cũng phải loopback.
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const oh = new URL(origin).hostname.toLowerCase();
      if (!LOCAL_HOSTS.has(oh)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Redact repo root, ổ đĩa tuyệt đối, runtime path, và mọi token env (phòng thủ sâu). */
function sanitizeOutput(raw: string | null | undefined): string {
  if (!raw) return '';
  let out = raw;
  try {
    out = out.split(repoRoot()).join('[repo]');
  } catch {
    /* ignore */
  }
  out = out.replace(/[A-Za-z]:\\[^\s"']*/g, '[path]');
  out = out.replace(/(?:[^\s"']*\/)?(?:data\/temp|production\/archive|runs)\/[^\s"']*/g, '[path]');
  for (const k of [
    'FACEBOOK_PAGE_ACCESS_TOKEN',
    'FACEBOOK_ACCESS_TOKEN',
    'FB_ACCESS_TOKEN',
    'FACEBOOK_TOKEN',
  ]) {
    const v = (process.env[k] || '').trim();
    if (v.length >= 6) out = out.split(v).join('[redacted-token]');
  }
  return out.slice(0, 1200);
}

/** Đọc facebook_publish_status.json (runtime) và trả subset đã sanitize. */
function readSanitizedPublishStatus(jobId: string): Record<string, unknown> | null {
  const abs = resolveInsideRepo(`data/temp/jobs/${jobId}/facebook_publish_status.json`);
  if (!abs || !existsSync(abs)) return null;
  try {
    const s = JSON.parse(readFileSync(abs, 'utf-8')) as {
      state?: string;
      facebook?: {
        pageName?: string;
        postId?: string;
        videoId?: string;
        published?: boolean;
        permalinkUrl?: string;
        verifiedByGraphReadback?: boolean;
      };
    };
    return {
      state: s.state ?? null,
      published: s.facebook?.published ?? null,
      postId: s.facebook?.postId ?? null,
      videoId: s.facebook?.videoId ?? null,
      pageName: s.facebook?.pageName ?? null,
      permalinkUrl: s.facebook?.permalinkUrl ?? null,
      verifiedByGraphReadback: s.facebook?.verifiedByGraphReadback ?? null,
    };
  } catch {
    return null;
  }
}

// ── GET — preflight (READ-ONLY, không side effect, không gọi command) ─────────
export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', message: 'Mã Job ID không hợp lệ.' },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get('shopId') || undefined;
  const itemId = searchParams.get('itemId') || undefined;
  const shortLink = searchParams.get('shortLink') || undefined;
  const expectedProduct = (shopId || itemId || shortLink) ? { shopId, itemId, shortLink } : undefined;

  const envEnabled = isLivePublishEnvEnabled();
  const gate = evaluateLivePublishGates(jobId, expectedProduct);
  if (!gate.jobExists) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', message: `Không tìm thấy Job: ${jobId}` },
      { status: 404 },
    );
  }

  const canLivePublish = envEnabled && gate.gatesPassed && !gate.alreadyPublished;

  return Response.json({
    ok: true,
    jobId,
    livePublishEnabled: envEnabled,
    livePublishEnabledReason: livePublishDisabledReason(),
    confirmPhrase: livePublishConfirmPhrase(jobId),
    facebookCredentialsConfigured: facebookCredentialsConfigured(),
    facebookPageIdConfigured: !!(process.env.FACEBOOK_PAGE_ID || '').trim(),
    facebookPageAccessTokenConfigured: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim(),
    metaModeLive: (process.env.META_MODE || '').trim().toLowerCase() === 'live',
    studioLivePublishEnabled: envEnabled,
    alreadyPublished: gate.alreadyPublished,
    jobState: gate.rawState,
    productName: gate.productName,
    targetChannel: gate.targetChannel,
    gates: gate.gates,
    blockedReasons: gate.blockedReasons,
    gatesPassed: gate.gatesPassed,
    canLivePublish,
  });
}

// ── POST — guarded LIVE publish ───────────────────────────────────────────────
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  // 1. jobId validation (anti command-injection / path traversal)
  if (!JOB_ID_RE.test(jobId)) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', message: 'Mã Job ID không hợp lệ.' },
      { status: 400 },
    );
  }

  // 2. Local-only guard (bắt buộc)
  const localOnly = isLocalOnly(req);
  if (!localOnly) {
    return Response.json(
      {
        ok: false,
        code: 'LIVE_PUBLISH_REQUIRES_LOCALHOST',
        message: 'Live publish is only allowed from localhost.',
      },
      { status: 403 },
    );
  }

  // Parse options from request body — Phase C UX: KHÔNG còn confirm phrase.
  // expectedProduct (Product Card hiện tại) vẫn được gửi để server đối chiếu
  // Product Binding (Product Review Guardian). Default-deny nếu thiếu/ sai.
  let expectedProduct: { shortLink?: string; shopId?: string; itemId?: string } | undefined;
  try {
    const body = (await req.json()) as {
      expectedProduct?: { shortLink?: string; shopId?: string; itemId?: string };
    };
    if (body && body.expectedProduct) expectedProduct = body.expectedProduct;
  } catch {
    /* body có thể rỗng */
  }

  // 3. Job tồn tại & Check gates với explicit context
  const gate = evaluateLivePublishGates(jobId, expectedProduct);
  if (!gate.jobExists) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', message: `Không tìm thấy Job: ${jobId}` },
      { status: 404 },
    );
  }

  // 4. Env flag (mặc định tắt → chặn)
  const envEnabled = isLivePublishEnvEnabled();
  if (!envEnabled) {
    return Response.json(
      {
        ok: false,
        code: 'LIVE_PUBLISH_DISABLED',
        message: 'Live publish is disabled.',
        reason: livePublishDisabledReason(),
      },
      { status: 403 },
    );
  }

  // 5. Gate server-side (KHÔNG tin client). Phase C UX bỏ confirm phrase: cú click
  // nút "Đăng bài Facebook" của Operator chính là xác nhận. Mọi gate Publish Safety /
  // Product Binding / owner / env / fallback / alreadyPublished vẫn enforce nguyên vẹn
  // qua evaluateLivePublishGates — gate, không phải UI, mới quyết định publish.
  const details = [...gate.blockedReasons];

  if (details.length > 0) {
    appendPublishAuditLog(jobId, {
      action: 'LIVE_PUBLISH_FACEBOOK',
      jobId,
      requestedAt: new Date().toISOString(),
      localOnly,
      envLivePublishEnabled: envEnabled,
      confirmMode: 'one_click',
      operatorIntent: 'one_click_publish',
      gateStatus: 'BLOCKED',
      result: 'BLOCKED',
      exitCode: null,
      operatorSource: 'localhost',
    });
    return Response.json(
      {
        ok: false,
        code: 'LIVE_PUBLISH_GATE_BLOCKED',
        message: 'Live publish is blocked.',
        details,
      },
      { status: 400 },
    );
  }

  // 6. Tất cả guard pass → ghi audit (attempt) rồi gọi command thật.
  const requestedAt = new Date().toISOString();
  // Gọi command thật qua tsx (an toàn EINVAL + injection — xem run-command.ts).
  // Timeout 600s: live Reels upload thật = binary upload + Facebook processing poll
  // (tối đa ~240s) + Graph readback verify — vượt default 120s.
  const run = runRepoScript(
    'scripts/job-facebook-publish-command.ts',
    ['--job', jobId, '--confirm-live-publish'],
    600_000,
  );

  const exitCode = typeof run.status === 'number' ? run.status : null;
  const succeeded = !run.error && exitCode === 0;

  appendPublishAuditLog(jobId, {
    action: 'LIVE_PUBLISH_FACEBOOK',
    jobId,
    requestedAt,
    localOnly,
    envLivePublishEnabled: envEnabled,
    confirmMode: 'one_click',
    operatorIntent: 'one_click_publish',
    gateStatus: 'PASS',
    result: succeeded ? 'SUCCESS' : 'FAIL',
    exitCode,
    operatorSource: 'localhost',
  });

  if (!succeeded) {
    return Response.json(
      {
        ok: false,
        code: 'COMMAND_FAILED',
        message: `Command job:publish-facebook thất bại (exit ${exitCode ?? 'null'}).`,
        exitCode,
        timedOut: run.error?.message?.includes('ETIMEDOUT') ?? false,
        stderr: sanitizeOutput(run.stderr),
        stdout: sanitizeOutput(run.stdout),
      },
      { status: 500 },
    );
  }

  // 7. Success → trả state thật + kết quả publish đã sanitize.
  const after = evaluateLivePublishGates(jobId);
  return Response.json({
    ok: true,
    action: 'LIVE_PUBLISH_FACEBOOK',
    jobId,
    jobState: after.rawState,
    published: after.alreadyPublished,
    result: readSanitizedPublishStatus(jobId),
    message: 'Live publish command completed.',
  });
}
