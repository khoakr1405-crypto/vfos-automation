import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { loadJobById } from '@/lib/studio-data/jobs';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const JOBS_ROOT_REL = 'data/temp/jobs';

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
    // 2. Parse and validate confirmPhrase
    let confirmPhrase = '';
    try {
      const body = await req.json();
      confirmPhrase = body?.confirmPhrase ?? '';
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

    // 3. Load job manifest
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

    let manifest: any;
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

    const sourceVideoUrl = manifest?.source?.sourceVideoUrl;
    if (!sourceVideoUrl) {
      return Response.json(
        {
          ok: false,
          action: 'source-intake',
          jobId,
          code: 'MISSING_SOURCE_URL',
          message: 'Không tìm thấy URL nguồn trong manifest của Job.',
        },
        { status: 400 },
      );
    }

    // 4. Run `intake-clean` script via tsx
    const scriptArgs = ['intake-clean', '--job', jobId, '--video-url', sourceVideoUrl];
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

    // 5. Success -> load updated job and return
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'source-intake',
      jobId,
      job: updatedJob,
      message: 'Tải và kiểm tra nguồn sạch thành công.',
    });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        action: 'source-intake',
        jobId,
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Lỗi hệ thống khi tải/clean nguồn.',
      },
      { status: 500 },
    );
  }
}
