/* =============================================================================
 * VFOS Studio — Source Intake (download + clean) for a specific job.
 * -----------------------------------------------------------------------------
 * POST /api/studio/jobs/[jobId]/source-intake
 *
 * Accepts an optional `sourceUrl` in the request body. If provided, the URL is
 * validated and persisted to the job manifest's `source.sourceVideoUrl` BEFORE
 * running intake-clean — so the manifest is always the source of truth and the
 * intake script never reads a URL that isn't persisted.
 *
 * If `sourceUrl` is not in the body, falls back to the URL already in the
 * manifest. If neither exists → MISSING_SOURCE_URL.
 *
 * NO publish, NO approve, NO production, NO OpenAI/ElevenLabs.
 * ========================================================================== */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadJobById } from '@/lib/studio-data/jobs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const JOBS_ROOT_REL = 'data/temp/jobs';

/** Loose validation: http(s) URL pointing at a known video-source domain. */
function isPlausibleSourceUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.length > 3000) return false;
  // Accept Douyin, TikTok, and generic http(s) — the intake-clean script
  // itself handles the actual download; we only gate obviously invalid input.
  return true;
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  // 1. Strict validation of jobId to prevent directory traversal
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      {
        ok: false,
        action: 'source-intake',
        jobId,
        code: 'BAD_JOB_ID',
        message: 'Mã Job ID không hợp lệ.',
      },
      { status: 400 },
    );
  }

  try {
    // 2. Parse body: confirmPhrase (required) + sourceUrl (optional)
    let confirmPhrase = '';
    let bodySourceUrl = '';
    try {
      const body = await req.json();
      confirmPhrase = body?.confirmPhrase ?? '';
      bodySourceUrl = typeof body?.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    } catch {
      // Body empty or malformed
    }

    if (confirmPhrase !== 'RUN SOURCE INTAKE') {
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'INVALID_CONFIRM_PHRASE',
          message: 'Xác nhận chạy không chính xác. Phải nhập "RUN SOURCE INTAKE".',
        },
        { status: 400 },
      );
    }

    // 3. Validate body sourceUrl if provided
    if (bodySourceUrl && !isPlausibleSourceUrl(bodySourceUrl)) {
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'INVALID_SOURCE_URL',
          message:
            'URL nguồn không hợp lệ — phải bắt đầu bằng http:// hoặc https:// và dưới 3000 ký tự.',
        },
        { status: 400 },
      );
    }

    // 4. Load job manifest
    const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
    const manifestAbs = resolveInsideRepo(manifestRel);
    if (!manifestAbs || !existsSync(manifestAbs)) {
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'JOB_NOT_FOUND',
          message: `Không tìm thấy Job có ID: ${jobId}`,
        },
        { status: 404 },
      );
    }

    let manifest: { source?: { sourceVideoUrl?: string }; updatedAt?: string };
    try {
      manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
    } catch {
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'MANIFEST_UNREADABLE',
          message: 'Không thể đọc file manifest của Job.',
        },
        { status: 500 },
      );
    }

    // 5. Resolve source URL: body (Operator's latest intent) > manifest (persisted)
    const resolvedUrl = bodySourceUrl || manifest?.source?.sourceVideoUrl || '';
    if (!resolvedUrl) {
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'MISSING_SOURCE_URL',
          message:
            'Không tìm thấy URL nguồn — không có trong request body và không có trong manifest của Job. Vui lòng dán URL nguồn video.',
        },
        { status: 400 },
      );
    }

    // 6. PERSIST to manifest BEFORE running intake (contract: manifest is source of truth)
    const source = manifest.source ?? {};
    manifest.source = source;
    const urlChanged = source.sourceVideoUrl !== resolvedUrl;
    if (urlChanged) {
      source.sourceVideoUrl = resolvedUrl;
      manifest.updatedAt = new Date().toISOString();
      writeFileSync(manifestAbs, JSON.stringify(manifest, null, 2), 'utf8');
      console.log(
        `[source-intake] Persisted sourceVideoUrl to manifest for ${jobId}: ${resolvedUrl}`,
      );
    }

    // 7. Run `intake-clean` script via tsx
    const scriptArgs = ['intake-clean', '--job', jobId, '--video-url', resolvedUrl];
    const run = runRepoScript('scripts/vfos-job-manager.ts', scriptArgs);

    if (run.status !== 0) {
      const stderr = (run.stderr || '').trim();
      const stdout = (run.stdout || '').trim();
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'COMMAND_FAILED',
          message: `Command pnpm source:intake-clean thất bại với mã thoát ${run.status}.`,
          details: [
            `Exit code: ${run.status}`,
            stderr ? `Stderr: ${stderr.slice(0, 500)}` : null,
            stdout ? `Stdout: ${stdout.slice(0, 500)}` : null,
          ].filter(Boolean),
        },
        { status: 500 },
      );
    }

    // 8. Success -> load updated job and return
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'source-intake',
      jobId,
      job: updatedJob,
      sourceVideoUrl: resolvedUrl,
      urlPersistedToManifest: urlChanged,
      message: 'Tải và kiểm tra nguồn sạch thành công.',
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        action: 'source-intake',
        jobId,
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi hệ thống khi tải/clean nguồn.',
      },
      { status: 500 },
    );
  }
}
