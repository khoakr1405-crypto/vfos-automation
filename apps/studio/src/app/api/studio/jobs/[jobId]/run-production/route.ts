import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import { loadJobById } from '@/lib/studio-data/jobs';
import { repoRoot, resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript, runRepoScriptDetached } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const JOBS_ROOT_REL = 'data/temp/jobs';
const EXPECTED_OWNER = 'an_17376660568';

/**
 * Round C3 — Action 2 wiring: chạy pipeline sản xuất video (script → voice → BGM →
 * render → caption → QA) cho 1 job ĐÃ duyệt nguồn sạch. REUSE command thật:
 *   pnpm job:run-review --job <jobId> --file <cleanSource> --confirm-ai
 * (= scripts/vfos-job-manager.ts run-review, bọc review-video-orchestrator.ts).
 *
 * An toàn:
 *   - local-only, safe runner (shell:false, argv mảng).
 *   - validate jobId + job tồn tại + owner Product Card + nguồn đã approved.
 *   - KHÔNG nhận path tùy ý từ client; clean source resolve TỪ jobId.
 *   - real run chạy NỀN (detached) vì pipeline mất vài phút; dry-run chạy sync.
 *   - KHÔNG publish, KHÔNG gọi Facebook/TikTok.
 *   - response sanitized: không trả absolute path / token.
 */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  // 1. Validate jobId (anti path-traversal)
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return Response.json(
      {
        ok: false,
        action: 'run-production',
        jobId,
        status: 'FAILED',
        reasonCode: 'BAD_JOB_ID',
        message: 'Mã Job ID không hợp lệ.',
      },
      { status: 400 },
    );
  }

  try {
    // 2. Parse + scan body
    let body: { confirmPhrase?: string; dryRun?: boolean } = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      // empty body allowed (dry-run mặc định false → cần confirm phrase)
    }

    const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
    if (sensitive.length > 0) {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'FAILED',
          reasonCode: 'SENSITIVE_REJECTED',
          message: 'Nội dung chứa từ khóa nhạy cảm bị cấm.',
          fields: sensitive,
        },
        { status: 400 },
      );
    }

    const dryRun = body?.dryRun === true;
    const confirmPhrase = body?.confirmPhrase ?? '';

    // 3. Confirm phrase bắt buộc cho REAL run (dry-run an toàn, không cần)
    if (!dryRun && confirmPhrase !== 'RUN PRODUCTION') {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'FAILED',
          reasonCode: 'INVALID_CONFIRM_PHRASE',
          message: 'Xác nhận chạy không chính xác. Phải nhập "RUN PRODUCTION".',
        },
        { status: 400 },
      );
    }

    // 4. Load manifest
    const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
    const manifestAbs = resolveInsideRepo(manifestRel);
    if (!manifestAbs || !existsSync(manifestAbs)) {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'FAILED',
          reasonCode: 'JOB_NOT_FOUND',
          message: `Không tìm thấy Job có ID: ${jobId}`,
        },
        { status: 404 },
      );
    }

    let manifest: {
      source?: {
        cleanlinessStatus?: string | null;
        sourceVideoUrl?: string | null;
        sourceVideoPath?: string | null;
        approvedSourceVideoPath?: string | null;
        productCardPath?: string | null;
      };
    };
    try {
      manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
    } catch {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'FAILED',
          reasonCode: 'MANIFEST_UNREADABLE',
          message: 'Không thể đọc file manifest của Job.',
        },
        { status: 500 },
      );
    }

    // 5. Clean source gate — chỉ chạy khi đã duyệt sạch
    const cleanlinessStatus = manifest?.source?.cleanlinessStatus ?? null;
    if (cleanlinessStatus !== 'WATERMARK_NOT_DETECTED') {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'SUSPENDED',
          stage: 'gate',
          reasonCode: 'SOURCE_NOT_APPROVED',
          cleanlinessStatus,
          message:
            'Nguồn chưa được duyệt sạch (cần WATERMARK_NOT_DETECTED ở Bước 2 trước khi sản xuất).',
        },
        { status: 400 },
      );
    }

    // 6. Owner gate (nếu Product Card có metadata)
    const cardRel = manifest?.source?.productCardPath;
    if (cardRel) {
      const cardAbs = resolveInsideRepo(cardRel);
      if (cardAbs && existsSync(cardAbs)) {
        try {
          const card = JSON.parse(readFileSync(cardAbs, 'utf8')) as {
            affiliateOwnerId?: string | null;
            validationStatus?: string | null;
          };
          const ownerValid =
            card?.affiliateOwnerId === EXPECTED_OWNER && card?.validationStatus === 'VERIFIED';
          if (!ownerValid) {
            return Response.json(
              {
                ok: false,
                action: 'run-production',
                jobId,
                status: 'SUSPENDED',
                stage: 'gate',
                reasonCode: 'OWNER_INVALID',
                message: 'Product Card sai affiliate owner hoặc chưa xác thực (VERIFIED).',
              },
              { status: 400 },
            );
          }
        } catch {
          // card không đọc được → bỏ qua owner gate (không chặn cứng vì thiếu metadata)
        }
      }
    }

    // 7. Resolve clean source TỪ jobId (không nhận path từ client). Chỉ chấp nhận
    //    path nằm trong runs/<jobId>/ hoặc data/temp/jobs/<jobId>/.
    const candidateRels = [
      manifest?.source?.approvedSourceVideoPath,
      manifest?.source?.sourceVideoPath,
      `runs/${jobId}/source/clean_source_video.mp4`,
    ];
    let cleanSourceRel: string | null = null;
    for (const rel of candidateRels) {
      if (!rel || typeof rel !== 'string') continue;
      if (!(rel.startsWith(`runs/${jobId}/`) || rel.startsWith(`${JOBS_ROOT_REL}/${jobId}/`))) {
        continue;
      }
      const abs = resolveInsideRepo(rel);
      if (abs && existsSync(abs)) {
        cleanSourceRel = rel;
        break;
      }
    }
    if (!cleanSourceRel) {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'FAILED',
          stage: 'gate',
          reasonCode: 'CLEAN_SOURCE_MISSING',
          message:
            'Không tìm thấy file clean source của Job (chạy lại Bước 2 — Tải / clean nguồn).',
        },
        { status: 400 },
      );
    }

    const sourceVideoUrl = extractFirstUrl(manifest?.source?.sourceVideoUrl);

    // 8. Build args — REUSE đúng command vận hành chính thức
    const args = ['run-review', '--job', jobId, '--file', cleanSourceRel, '--confirm-ai'];
    if (dryRun) args.push('--dry-run');

    // 9a. DRY-RUN: sync, không gọi API, không tạo video → trả gate/plan
    if (dryRun) {
      const run = runRepoScript('scripts/vfos-job-manager.ts', args);
      const ok = run.status === 0;
      const combined = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim();
      const reportSummary = sanitizeOutput(combined).slice(-1200);
      const updatedJob = loadJobById(jobId);
      return Response.json(
        {
          ok,
          action: 'run-production',
          jobId,
          status: ok ? 'DRY_RUN_OK' : 'FAILED',
          stage: 'dry-run',
          cleanSourceReady: true,
          cleanlinessStatus,
          sourceVideoUrl,
          reportSummary,
          message: ok
            ? 'Dry-run OK — gate + wiring hợp lệ (không gọi API, không tạo video).'
            : `Dry-run thất bại (exit ${run.status ?? 'null'}).`,
          job: updatedJob,
        },
        { status: ok ? 200 : 500 },
      );
    }

    // 9b. REAL: chạy nền (detached) vì pipeline mất vài phút. Log vào runtime gitignored.
    const logRel = `${JOBS_ROOT_REL}/${jobId}/production_run.log`;
    const logAbs = resolveInsideRepo(logRel);
    if (!logAbs) {
      return Response.json(
        {
          ok: false,
          action: 'run-production',
          jobId,
          status: 'FAILED',
          reasonCode: 'LOG_PATH_INVALID',
          message: 'Không thể tạo đường dẫn log an toàn trong repo.',
        },
        { status: 500 },
      );
    }
    try {
      mkdirSync(dirname(logAbs), { recursive: true });
    } catch {
      // dir thường đã tồn tại (job runtime)
    }

    const { pid } = runRepoScriptDetached('scripts/vfos-job-manager.ts', args, logAbs);
    const updatedJob = loadJobById(jobId);
    return Response.json({
      ok: true,
      action: 'run-production',
      jobId,
      status: 'RUNNING',
      stage: 'launch',
      cleanSourceReady: true,
      cleanlinessStatus,
      sourceVideoUrl,
      reportSummary: pid ? 'Tiến trình sản xuất đã khởi chạy nền.' : undefined,
      message:
        'Đã khởi chạy sản xuất video nền: script → voice → BGM → render → caption → QA. ' +
        'Bấm "Làm mới trạng thái" để cập nhật tiến trình (mất vài phút).',
      job: updatedJob,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        action: 'run-production',
        jobId,
        status: 'FAILED',
        reasonCode: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi hệ thống khi chạy sản xuất video.',
      },
      { status: 500 },
    );
  }
}

/** Lấy URL http(s) đầu tiên từ chuỗi sourceVideoUrl (manifest có thể lẫn text rác). */
function extractFirstUrl(raw: string | null | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const m = raw.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : undefined;
}

/** Bỏ absolute path (drive letter + repo root) khỏi output trước khi trả client. */
function sanitizeOutput(text: string): string {
  if (!text) return '';
  let out = text;
  try {
    const root = repoRoot();
    out = out.split(root).join('[repo]');
    // bản backslash của repo root (Windows)
    out = out.split(root.replace(/\//g, '\\')).join('[repo]');
  } catch {
    // ignore
  }
  // mọi đường dẫn drive-letter còn sót lại → [path]
  out = out.replace(/[A-Za-z]:\\[^\s"']+/g, '[path]');
  return out;
}
