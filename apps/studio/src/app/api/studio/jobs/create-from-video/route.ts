/* =============================================================================
 * VFOS Studio — Create job from video URL (Video-First intake / Trend Scout POV)
 * -----------------------------------------------------------------------------
 * POST { videoUrl } → spawn `pnpm job:create --from-video-url <url>` (CLI đã
 * audit — single writer của manifest/registry). Job sinh ra ở state
 * WAITING_FOR_PRODUCT: production BỊ CHẶN (PRODUCT_CARD_MISSING) tới khi
 * Operator gắn Product Card qua /attach-product. Local-only, KHÔNG download,
 * KHÔNG publish.
 * ========================================================================== */

import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }

  let body: { videoUrl?: unknown };
  try {
    body = (await req.json()) as { videoUrl?: unknown };
  } catch {
    return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 });
  }

  const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
  if (sensitive.length > 0) {
    return Response.json(
      { ok: false, code: 'SENSITIVE_REJECTED', fields: sensitive },
      { status: 400 },
    );
  }

  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  if (!/^https:\/\/[^\s"']+$/i.test(videoUrl)) {
    return Response.json(
      { ok: false, code: 'BAD_URL', message: 'videoUrl phải là URL https hợp lệ.' },
      { status: 400 },
    );
  }

  const spawnRes = runRepoScript('scripts/vfos-job-manager.ts', [
    'create',
    '--from-video-url',
    videoUrl,
  ]);
  if (spawnRes.status !== 0) {
    return Response.json(
      {
        ok: false,
        code: 'SCRIPT_EXEC_FAILED',
        message: 'Không chạy được script tạo Job từ video.',
        stderr: (spawnRes.stderr ?? '').slice(-400),
      },
      { status: 500 },
    );
  }

  const match = (spawnRes.stdout ?? '').match(/Job ID:\s+(job_\d{8}_\d{3})/);
  if (!match) {
    return Response.json(
      { ok: false, code: 'PARSING_FAILED', message: 'Không parse được Job ID từ stdout.' },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    jobId: match[1],
    state: 'WAITING_FOR_PRODUCT',
    sourceVideoUrl: videoUrl,
  });
}
