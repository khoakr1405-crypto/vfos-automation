import { loadJobById } from '@/lib/studio-data/jobs';
import { repoRoot } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

/**
 * Đóng Loop Sản Xuất (RFC docs/RFC_VIDEO_RENDERER.md) — nối cỗ máy render mới lên UI.
 * Side-effect DUY NHẤT: gọi ngầm command vận hành chính thức:
 *   pnpm job:render-video --job <jobId> --confirm-render
 * (= scripts/vfos-job-manager.ts render-video → @vfos/video-engine).
 *
 * TÁCH BIỆT với run-production (route cũ, pipeline run-review) — additive, không đụng.
 *
 * An toàn:
 *   - local-only, safe runner (shell:false, argv mảng) — KHÔNG viết lại logic render.
 *   - Gate server-side: state=SOURCE_READY + cleanliness=WATERMARK_NOT_DETECTED
 *     + render_plan.json tồn tại (thiếu plan → chặn sớm, hướng dẫn bước trước).
 *   - KHÔNG publish: render xong job dừng ở READY_FOR_OPERATOR_REVIEW chờ duyệt tay.
 *   - Response sanitized: không trả absolute path.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      {
        ok: false,
        action: 'run-render-video',
        jobId,
        status: 'FAILED',
        reasonCode: 'BAD_JOB_ID',
        message: 'Mã Job ID không hợp lệ.',
      },
      { status: 400 },
    );
  }

  try {
    const job = loadJobById(jobId);
    if (!job) {
      return Response.json(
        {
          ok: false,
          action: 'run-render-video',
          jobId,
          status: 'FAILED',
          reasonCode: 'UNKNOWN_JOB',
          message: 'Không tìm thấy Job trong registry/manifest.',
        },
        { status: 404 },
      );
    }

    // Gate 1: đúng trạng thái nguồn sạch sẵn sàng render.
    if (job.state !== 'SOURCE_READY') {
      return Response.json(
        {
          ok: false,
          action: 'run-render-video',
          jobId,
          status: 'SUSPENDED',
          stage: 'gate',
          reasonCode: 'INVALID_STATE',
          message: `Job phải ở trạng thái SOURCE_READY (hiện tại: ${job.state}).`,
        },
        { status: 409 },
      );
    }

    // Gate 2: nguồn đã duyệt sạch (không watermark).
    if (job.cleanlinessStatus !== 'WATERMARK_NOT_DETECTED') {
      return Response.json(
        {
          ok: false,
          action: 'run-render-video',
          jobId,
          status: 'SUSPENDED',
          stage: 'gate',
          reasonCode: 'SOURCE_NOT_CLEAN',
          message: `Nguồn chưa được duyệt sạch (cleanliness: ${job.cleanlinessStatus ?? 'chưa có'}).`,
        },
        { status: 409 },
      );
    }

    // Gate 3: render_plan.json phải có sẵn (sinh bởi job:script → job:render-plan).
    if (!job.hasRenderPlan) {
      return Response.json(
        {
          ok: false,
          action: 'run-render-video',
          jobId,
          status: 'SUSPENDED',
          stage: 'gate',
          reasonCode: 'RENDER_PLAN_MISSING',
          message:
            'Chưa có render_plan.json — chạy trước: pnpm job:script rồi pnpm job:render-plan --confirm-tts.',
        },
        { status: 409 },
      );
    }

    // Side-effect duy nhất: spawn command render thật (sync — render ~1-2 phút,
    // timeout nới 300s; KHÔNG viết lại logic render ở đây).
    const run = runRepoScript(
      'scripts/vfos-job-manager.ts',
      ['render-video', '--job', jobId, '--confirm-render'],
      300_000,
    );
    const ok = run.status === 0;
    const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim();
    const reportSummary = sanitizeOutput(combined).slice(-1200);
    const updatedJob = loadJobById(jobId);

    return Response.json(
      {
        ok,
        action: 'run-render-video',
        jobId,
        status: ok ? 'RENDERED' : 'FAILED',
        exitCode: run.status,
        reportSummary,
        message: ok
          ? 'Render xong — job chuyển sang chờ Operator duyệt (không publish).'
          : `Render thất bại (exit ${run.status ?? 'null'}). Xem reportSummary để biết filter/lỗi.`,
        job: updatedJob,
      },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    return Response.json(
      {
        ok: false,
        action: 'run-render-video',
        jobId,
        status: 'FAILED',
        reasonCode: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi hệ thống khi render video.',
      },
      { status: 500 },
    );
  }
}

/** Bỏ absolute path (repo root + drive letter) khỏi output trước khi trả client. */
function sanitizeOutput(text: string): string {
  if (!text) return '';
  let out = text;
  try {
    const root = repoRoot();
    out = out.split(root).join('[repo]');
    out = out.split(root.replace(/\//g, '\\')).join('[repo]');
  } catch {
    // ignore
  }
  return out.replace(/[A-Za-z]:\\[^\s"']+/g, '[path]');
}
