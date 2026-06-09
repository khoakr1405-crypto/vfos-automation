import { loadJobById } from '@/lib/studio-data/jobs';
import { repoRoot } from '@/lib/studio-data/paths';
import {
  compareProductBinding,
  extractBinding,
  isFallbackSource,
} from '@/lib/studio-data/production-gates';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

/* =============================================================================
 * Action 3 — Phase A: job-aware PACKAGE route.
 * -----------------------------------------------------------------------------
 * POST /api/studio/jobs/[jobId]/package
 *
 * Bọc command vận hành job-aware THẬT (KHÔNG dùng production-packager.ts legacy):
 *   pnpm job:package --job <jobId> [--dry-run]   (= scripts/vfos-job-manager.ts package)
 * Command đó copy artifact + sinh caption.txt/hashtags.txt/publish_readiness_report.md/
 * package_manifest.json vào production/archive/<jobId>/ và chuyển APPROVED → PACKAGED.
 * NÓ KHÔNG bao giờ publish / gọi Facebook / OpenAI / ElevenLabs / chạy production.
 *
 * An toàn:
 *   - Synchronous (runRepoScript, shell:false, argv mảng) → không kẹt RUNNING.
 *   - Chỉ truyền jobId (đã validate regex) + cờ --dry-run cho command; expectedProduct
 *     chỉ dùng đối chiếu binding TRONG process, không vào shell → không injection.
 *   - Gate route (defense-in-depth) chặn sớm 2 thứ command KHÔNG tự kiểm: fallback
 *     source + Product Binding mismatch; còn lại command tự enforce (exit code).
 *   - Response sanitized: không lộ absolute path / repo root.
 *   - KHÔNG publish, KHÔNG Facebook API, KHÔNG production, KHÔNG commit output runtime.
 * ========================================================================== */

const JOB_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Map exit code của `pnpm job:package` (cmdPackage) → message Operator dễ hiểu. */
const PACKAGE_EXIT: Record<number, { code: string; message: string }> = {
  1: { code: 'PACKAGE_BAD_ARGS', message: 'Thiếu tham số --job khi gọi đóng gói.' },
  2: { code: 'JOB_NOT_FOUND', message: 'Không tìm thấy Job (manifest thiếu).' },
  3: {
    code: 'JOB_NOT_APPROVED',
    message: 'Job chưa ở trạng thái APPROVED (cần state=APPROVED + Operator đã duyệt preview).',
  },
  4: { code: 'CAPTIONED_PREVIEW_MISSING', message: 'Thiếu video bản cuối (captioned preview).' },
  5: { code: 'FINAL_QA_MISSING', message: 'Chưa có báo cáo Final QA cho job.' },
  6: { code: 'FINAL_QA_NOT_PASSING', message: 'Final QA chưa PASS — không thể đóng gói.' },
  7: { code: 'PRODUCT_CARD_MISSING', message: 'Thiếu Product Card của job.' },
  8: {
    code: 'SCRIPT_ARTIFACT_MISSING',
    message: 'Thiếu script artifact — chạy lại sản xuất (Action 2).',
  },
  9: {
    code: 'VOICE_ARTIFACT_MISSING',
    message: 'Thiếu voice artifact — chạy lại sản xuất (Action 2).',
  },
  10: { code: 'FINAL_VIDEO_AUDIO_MISSING', message: 'Video bản cuối thiếu audio.' },
  11: {
    code: 'JOB_ALREADY_PUBLISHED',
    message: 'Job đã được publish/upload trước đó — không đóng gói lại.',
  },
};

/** Bỏ repo root + absolute drive path khỏi output trước khi trả client. */
function sanitize(raw: string | null | undefined): string {
  if (!raw) return '';
  let out = raw;
  try {
    const root = repoRoot();
    out = out.split(root).join('[repo]').split(root.replace(/\//g, '\\')).join('[repo]');
  } catch {
    /* ignore */
  }
  out = out.replace(/[A-Za-z]:\\[^\s"']+/g, '[path]');
  return out.slice(0, 600);
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  // 1. Validate jobId (anti path-traversal / command-injection)
  if (!JOB_ID_RE.test(jobId)) {
    return Response.json(
      { ok: false, action: 'package', jobId, code: 'BAD_JOB_ID', message: 'Mã Job ID không hợp lệ.' },
      { status: 400 },
    );
  }

  try {
    // 2. Parse options — dry-run từ query (?dryRun=1) HOẶC body (dryRun:true)
    let body: {
      dryRun?: boolean;
      expectedProduct?: { shortLink?: string; shopId?: string; itemId?: string };
    } = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      // body rỗng là hợp lệ (mặc định real-run)
    }
    const url = new URL(req.url);
    const dryRunQuery = url.searchParams.get('dryRun');
    const dryRun = body?.dryRun === true || dryRunQuery === '1' || dryRunQuery === 'true';
    const expectedProduct = body?.expectedProduct;

    // 3. Job tồn tại
    const job = loadJobById(jobId);
    if (!job) {
      return Response.json(
        {
          ok: false,
          action: 'package',
          jobId,
          code: 'JOB_NOT_FOUND',
          message: `Không tìm thấy Job có ID: ${jobId}`,
        },
        { status: 404 },
      );
    }

    // 4. Route-level gates (defense-in-depth — command tự kiểm lại).
    // 4a. Không fallback/demo source (command KHÔNG tự kiểm cái này).
    if (isFallbackSource(job.source)) {
      return Response.json(
        {
          ok: false,
          action: 'package',
          jobId,
          code: 'FALLBACK_SOURCE_BLOCKED',
          message:
            'Nguồn hiện tại là fallback/demo — không được đóng gói để đăng thật cho sản phẩm này.',
        },
        { status: 400 },
      );
    }

    // 4b. Không package nếu đã publish/upload. Trạng thái "đã publish" KHÔNG nằm ở
    // DTO state (đỉnh là PACKAGED) mà ở manifest.safety → để command job:package tự
    // enforce (exit 11 → ALREADY_PUBLISHED), tránh đọc fs trùng lặp ở route.

    // 4c. Phải APPROVED (state) hoặc operatorDecision=APPROVED.
    if (job.state !== 'APPROVED' && job.operatorDecision !== 'APPROVED') {
      return Response.json(
        {
          ok: false,
          action: 'package',
          jobId,
          code: 'NOT_APPROVED',
          message:
            'Operator chưa phê duyệt video. Bấm "Duyệt preview video" trước khi đóng gói bài đăng.',
        },
        { status: 422 },
      );
    }

    // 4d. Final QA phải PASS.
    if (job.qaStatus !== 'PASS') {
      return Response.json(
        {
          ok: false,
          action: 'package',
          jobId,
          code: 'QA_NOT_PASS',
          message: `Final QA chưa PASS (hiện tại: ${job.qaStatus ?? 'chưa có'}).`,
        },
        { status: 422 },
      );
    }

    // 4e. Phải có captioned preview (video bản cuối).
    if (!job.hasPreview) {
      return Response.json(
        {
          ok: false,
          action: 'package',
          jobId,
          code: 'PREVIEW_MISSING',
          message: 'Thiếu video bản cuối (captioned preview) — kiểm tra lại bước render/caption.',
        },
        { status: 400 },
      );
    }

    // 4f. Product Binding phải khớp expectedProduct — CHỈ khi route nhận expectedProduct.
    if (expectedProduct) {
      const matches = compareProductBinding(extractBinding(job.productBinding), expectedProduct);
      if (!matches) {
        return Response.json(
          {
            ok: false,
            action: 'package',
            jobId,
            code: 'PRODUCT_BINDING_MISMATCH',
            message:
              'Sản phẩm đang chọn lệch với sản phẩm đã bind vào job — chọn lại đúng sản phẩm trước khi đóng gói.',
          },
          { status: 409 },
        );
      }
    }

    // 5. Gọi command job-aware THẬT (synchronous). Chỉ jobId + --dry-run vào argv.
    const args = ['package', '--job', jobId];
    if (dryRun) args.push('--dry-run');
    const run = runRepoScript('scripts/vfos-job-manager.ts', args);

    // 6. Map lỗi exit code → message dễ hiểu.
    if (run.status !== 0) {
      const exit = typeof run.status === 'number' ? run.status : -1;
      const mapped = PACKAGE_EXIT[exit] ?? {
        code: 'PACKAGE_COMMAND_FAILED',
        message: `Đóng gói thất bại (exit ${run.status ?? 'null'}).`,
      };
      const httpStatus = exit === 2 ? 404 : exit >= 3 && exit <= 11 ? 400 : 500;
      return Response.json(
        {
          ok: false,
          action: 'package',
          jobId,
          code: mapped.code,
          message: mapped.message,
          details: [
            `Exit code: ${run.status}`,
            sanitize(run.stderr) || null,
            sanitize(run.stdout) || null,
          ].filter(Boolean),
        },
        { status: httpStatus },
      );
    }

    // 7. Thành công → trả job đã cập nhật (dry-run: state KHÔNG đổi; real: PACKAGED).
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'package',
      jobId,
      dryRun,
      job: updatedJob,
      message: dryRun
        ? 'Dry-run đóng gói OK — đủ điều kiện, KHÔNG tạo gói, KHÔNG đổi trạng thái.'
        : 'Đã đóng gói bài đăng (PACKAGED). Chưa publish, không gọi Facebook API.',
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        action: 'package',
        jobId,
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi hệ thống khi đóng gói bài đăng.',
      },
      { status: 500 },
    );
  }
}
