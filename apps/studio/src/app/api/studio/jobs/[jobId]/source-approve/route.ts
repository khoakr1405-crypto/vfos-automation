/* =============================================================================
 * DEPRECATED (Option A — Product Review 5-step model, 2026-06-13)
 * -----------------------------------------------------------------------------
 * The human "Duyệt nguồn sạch / APPROVE SOURCE" gate was removed from the
 * Product Review Command Center main path. `intake-clean` now marks a real
 * downloaded source clean automatically; the Operator's visual review happens at
 * preview (Step 4). This endpoint is NO LONGER wired into the Studio UI and is
 * kept ONLY as a manual recovery/override tool (parity with the deprecated
 * `approve-cleanliness` CLI). Do NOT re-wire it as a workflow gate.
 * ========================================================================== */
import { existsSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { loadJobById } from '@/lib/studio-data/jobs';
import { runRepoScript } from '@/lib/studio-data/run-command';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';

export const dynamic = 'force-dynamic';

const JOBS_ROOT_REL = 'data/temp/jobs';

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  // 1. Strict validation of jobId to prevent directory traversal
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      {
        ok: false,
        action: 'source-approve',
        jobId,
        code: 'BAD_JOB_ID',
        message: 'Mã Job ID không hợp lệ.',
      },
      { status: 400 },
    );
  }

  try {
    // 2. Parse and validate parameters
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { ok: false, code: 'BAD_JSON', message: 'Payload không phải JSON hợp lệ.' },
        { status: 400 },
      );
    }

    // Scan for sensitive terms in payload
    const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
    if (sensitive.length > 0) {
      return Response.json(
        {
          ok: false,
          code: 'SENSITIVE_REJECTED',
          message: 'Nội dung chứa từ khóa nhạy cảm bị cấm.',
          fields: sensitive,
        },
        { status: 400 },
      );
    }

    const { status, notes, confirmPhrase } = body || {};

    if (status !== 'pass' && status !== 'fail') {
      return Response.json(
        { ok: false, code: 'BAD_STATUS', message: 'Trạng thái status phải là "pass" hoặc "fail".' },
        { status: 400 },
      );
    }

    if (!notes || !notes.trim()) {
      return Response.json(
        { ok: false, code: 'MISSING_NOTES', message: 'Ghi chú phê duyệt/từ chối là bắt buộc.' },
        { status: 400 },
      );
    }

    if (status === 'pass' && confirmPhrase !== 'APPROVE SOURCE') {
      return Response.json(
        {
          ok: false,
          code: 'INVALID_CONFIRM_PHRASE',
          message: 'Xác nhận phê duyệt không chính xác. Phải nhập "APPROVE SOURCE".',
        },
        { status: 400 },
      );
    }

    // 3. Load job manifest to ensure job exists
    const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
    const manifestAbs = resolveInsideRepo(manifestRel);
    if (!manifestAbs || !existsSync(manifestAbs)) {
      return Response.json(
        {
          ok: false,
          action: 'source-approve',
          jobId,
          code: 'JOB_NOT_FOUND',
          message: `Không tìm thấy Job có ID: ${jobId}`,
        },
        { status: 404 },
      );
    }

    // 4. Run `approve-cleanliness` script via tsx
    const scriptArgs = [
      'approve-cleanliness',
      '--job',
      jobId,
      '--status',
      status,
      '--notes',
      notes.trim(),
    ];
    const run = runRepoScript('scripts/vfos-job-manager.ts', scriptArgs);

    if (run.status !== 0) {
      const stderr = (run.stderr || '').trim();
      const stdout = (run.stdout || '').trim();
      return Response.json(
        {
          ok: false,
          action: 'source-approve',
          jobId,
          code: 'COMMAND_FAILED',
          message: `Command pnpm source:approve-cleanliness thất bại với mã thoát ${run.status}.`,
          details: [
            `Exit code: ${run.status}`,
            stderr ? `Stderr: ${stderr.slice(0, 500)}` : null,
            stdout ? `Stdout: ${stdout.slice(0, 500)}` : null,
          ].filter(Boolean),
        },
        { status: 500 },
      );
    }

    // 5. Success -> load updated job DTO and return
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'source-approve',
      jobId,
      job: updatedJob,
      message: status === 'pass' ? 'Phê duyệt nguồn video thành công.' : 'Từ chối nguồn video thành công.',
    });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        action: 'source-approve',
        jobId,
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Lỗi hệ thống khi phê duyệt nguồn.',
      },
      { status: 500 },
    );
  }
}
