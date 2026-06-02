import { spawnSync } from 'node:child_process';
import { repoRoot } from '@/lib/studio-data/paths';
import { loadJobById } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await ctx.params;

  // 1. Strict validation of jobId to prevent command injection / directory traversal
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      {
        ok: false,
        action: 'reject',
        jobId,
        code: 'BAD_JOB_ID',
        message: 'Mã Job ID không hợp lệ.'
      },
      { status: 400 }
    );
  }

  try {
    // 2. Parse request body for notes
    let notes = '';
    try {
      const body = await req.json();
      if (body && typeof body.notes === 'string') {
        notes = body.notes.trim();
      }
    } catch {
      // ignore
    }

    if (!notes || notes.length < 3) {
      return Response.json(
        {
          ok: false,
          action: 'reject',
          jobId,
          code: 'REJECT_NOTES_REQUIRED',
          message: 'Lý do từ chối (Notes) bắt buộc phải nhập và dài từ 3 ký tự trở lên.'
        },
        { status: 400 }
      );
    }

    // 3. Fetch current job and check Reject Guards
    const job = loadJobById(jobId);
    if (!job) {
      return Response.json(
        {
          ok: false,
          action: 'reject',
          jobId,
          code: 'JOB_NOT_FOUND',
          message: `Không tìm thấy Job có ID: ${jobId}`
        },
        { status: 404 }
      );
    }

    const details: string[] = [];
    if (job.state === 'PACKAGED') {
      details.push('Không thể từ chối Job đã được đóng gói (state: PACKAGED).');
    }

    if (details.length > 0) {
      return Response.json(
        {
          ok: false,
          action: 'reject',
          jobId,
          code: 'REJECT_GATE_BLOCKED',
          message: 'Không đủ điều kiện từ chối Job.',
          details
        },
        { status: 400 }
      );
    }

    // 4. Gọi lệnh pnpm job:reject thực tế
    const root = repoRoot();
    const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const args = ['job:reject', '--job', jobId, '--notes', notes];

    const run = spawnSync(cmd, args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env },
    });

    if (run.status !== 0) {
      const stderr = (run.stderr || '').trim();
      const stdout = (run.stdout || '').trim();
      return Response.json(
        {
          ok: false,
          action: 'reject',
          jobId,
          code: 'COMMAND_FAILED',
          message: `Command pnpm job:reject thất bại với mã thoát (exit code) ${run.status}.`,
          details: [
            `Exit code: ${run.status}`,
            stderr ? `Stderr: ${stderr.slice(0, 500)}` : null,
            stdout ? `Stdout: ${stdout.slice(0, 500)}` : null,
          ].filter(Boolean)
        },
        { status: 500 }
      );
    }

    // 5. Success -> load updated job DTO and return
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'reject',
      jobId,
      job: updatedJob,
      message: 'Job rejected.'
    });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        action: 'reject',
        jobId,
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Lỗi hệ thống trong quá trình xử lý từ chối.'
      },
      { status: 500 }
    );
  }
}
