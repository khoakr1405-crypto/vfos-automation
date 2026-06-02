import { loadJobById } from '@/lib/studio-data/jobs';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  // 1. Strict validation of jobId to prevent command injection / directory traversal
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      {
        ok: false,
        action: 'approve',
        jobId,
        code: 'BAD_JOB_ID',
        message: 'Mã Job ID không hợp lệ.',
      },
      { status: 400 },
    );
  }

  try {
    // 2. Fetch current job
    const job = loadJobById(jobId);
    if (!job) {
      return Response.json(
        {
          ok: false,
          action: 'approve',
          jobId,
          code: 'JOB_NOT_FOUND',
          message: `Không tìm thấy Job có ID: ${jobId}`,
        },
        { status: 404 },
      );
    }

    // 3. Rà soát điều kiện phê duyệt (Approve Guards)
    const details: string[] = [];
    if (job.state !== 'READY_FOR_OPERATOR_REVIEW') {
      details.push(
        `Trạng thái của Job phải là READY_FOR_OPERATOR_REVIEW (hiện tại: ${job.state}).`,
      );
    }
    if (job.qaStatus !== 'PASS') {
      details.push('Kết quả kiểm định Final QA chưa vượt qua (phải là PASS).');
    }
    if (!job.hasPreview) {
      details.push('Không tìm thấy tệp video captioned preview để Operator rà soát.');
    }

    if (details.length > 0) {
      return Response.json(
        {
          ok: false,
          action: 'approve',
          jobId,
          code: 'APPROVE_GATE_BLOCKED',
          message: 'Không đủ điều kiện phê duyệt Job.',
          details,
        },
        { status: 400 },
      );
    }

    // Parse options from request body if any
    let notes: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.notes === 'string') {
        notes = body.notes.trim() || null;
      }
    } catch {
      // Body may be empty, which is completely fine for approve
    }

    // 4. Gọi command thật qua tsx (an toàn EINVAL + injection — xem run-command.ts)
    const scriptArgs = ['approve', '--job', jobId];
    if (notes) {
      scriptArgs.push('--notes', notes);
    }

    const run = runRepoScript('scripts/vfos-job-manager.ts', scriptArgs);

    if (run.status !== 0) {
      const stderr = (run.stderr || '').trim();
      const stdout = (run.stdout || '').trim();
      return Response.json(
        {
          ok: false,
          action: 'approve',
          jobId,
          code: 'COMMAND_FAILED',
          message: `Command pnpm job:approve thất bại với mã thoát (exit code) ${run.status}.`,
          details: [
            `Exit code: ${run.status}`,
            stderr ? `Stderr: ${stderr.slice(0, 500)}` : null,
            stdout ? `Stdout: ${stdout.slice(0, 500)}` : null,
          ].filter(Boolean),
        },
        { status: 500 },
      );
    }

    // 5. Success -> load updated job and return DTO
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'approve',
      jobId,
      job: updatedJob,
      message: 'Job approved. Not published.',
    });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        action: 'approve',
        jobId,
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Lỗi hệ thống trong quá trình xử lý phê duyệt.',
      },
      { status: 500 },
    );
  }
}
