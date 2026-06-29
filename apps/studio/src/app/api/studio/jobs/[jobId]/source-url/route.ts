/* =============================================================================
 * VFOS Studio — Persist source URL to job manifest (PATCH only).
 * -----------------------------------------------------------------------------
 * PATCH /api/studio/jobs/[jobId]/source-url
 *
 * Writes `source.sourceVideoUrl` into the job's manifest. Used by "Lưu nháp"
 * so the URL is persisted to the manifest even before intake runs.
 *
 * NO download, NO intake, NO publish, NO shell commands.
 * ========================================================================== */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const JOBS_ROOT_REL = 'data/temp/jobs';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép từ local dev.' },
      { status: 403 },
    );
  }

  const { jobId } = await ctx.params;

  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', message: 'Mã Job ID không hợp lệ.' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, code: 'BAD_JSON', message: 'Payload không phải JSON hợp lệ.' },
      { status: 400 },
    );
  }

  const o = (body ?? {}) as { sourceUrl?: unknown };
  const url = (typeof o.sourceUrl === 'string' ? o.sourceUrl : '').trim();
  if (!url) {
    return Response.json(
      { ok: false, code: 'EMPTY_URL', message: 'sourceUrl không được rỗng.' },
      { status: 400 },
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    return Response.json(
      { ok: false, code: 'BAD_URL', message: 'URL phải bắt đầu bằng http:// hoặc https://.' },
      { status: 400 },
    );
  }
  if (url.length > 3000) {
    return Response.json(
      { ok: false, code: 'URL_TOO_LONG', message: 'URL quá dài (giới hạn 3000 ký tự).' },
      { status: 400 },
    );
  }

  const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
  const manifestAbs = resolveInsideRepo(manifestRel);
  if (!manifestAbs || !existsSync(manifestAbs)) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', message: `Không tìm thấy Job: ${jobId}` },
      { status: 404 },
    );
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
    if (!manifest.source) manifest.source = {};
    manifest.source.sourceVideoUrl = url;
    manifest.updatedAt = new Date().toISOString();
    writeFileSync(manifestAbs, JSON.stringify(manifest, null, 2), 'utf8');

    return Response.json({
      ok: true,
      jobId,
      sourceVideoUrl: url,
      message: 'URL nguồn đã được lưu vào manifest.',
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        code: 'WRITE_FAILED',
        message: err instanceof Error ? err.message : 'Không ghi được manifest.',
      },
      { status: 500 },
    );
  }
}
