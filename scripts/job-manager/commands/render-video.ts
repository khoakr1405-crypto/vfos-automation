// `render-video` command (RFC docs/RFC_VIDEO_RENDERER.md §5 — R3, TRẠM ĐIỀU PHỐI).
// Luồng: load manifest + render_plan.json → gate --confirm-render → renderVideo()
// (@vfos/video-engine) → ghi render_report.json → cập nhật manifest (previewVideoPath
// + state=READY_FOR_OPERATOR_REVIEW). KHÔNG publish. Render nặng → mặc định dừng-hỏi.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { renderVideo } from '../../../packages/video-engine/src/index.js';
import type { RenderPlanInput, RenderResult } from '../../../packages/video-engine/src/index.js';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { JOBS_ROOT } from '../core/paths.js';

export function cmdRenderVideo(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'confirm-render': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const confirmRender = Boolean(parsed.values['confirm-render']);
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  const jobDir = resolve(JOBS_ROOT, jobId);
  const renderPlanPath = resolve(jobDir, 'render_plan.json');
  if (!existsSync(renderPlanPath)) {
    console.error('🛑 RENDER_PLAN_MISSING');
    console.error(`  Run: pnpm job:render-plan --job ${jobId} --confirm-tts`);
    return 3;
  }

  let plan: RenderPlanInput;
  try {
    plan = JSON.parse(readFileSync(renderPlanPath, 'utf8')) as RenderPlanInput;
  } catch (e) {
    console.error(`🛑 INVALID_RENDER_PLAN_JSON: ${(e as Error).message}`);
    return 3;
  }

  console.log('======================================================');
  console.log(`🎬  VFOS Job Manager — render-video  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Subtitles:         ${plan.subtitles.length} cues`);
  console.log(`Duration:          ${plan.durationSec.toFixed(2)}s`);
  console.log(`Subtitle timing:   ${plan.subtitleTiming ?? 'perfect_match'}`);
  console.log(
    `BGM:               ${plan.audio.bgmPath ? plan.audio.bgmPath : '(none — voice only)'}`,
  );
  console.log(`Output:            ${plan.output.path}`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('🔍 [Dry-Run] Sẽ render preview.mp4 (cần --confirm-render). KHÔNG gọi ffmpeg.');
    return 0;
  }

  // Gate an toàn: render là thao tác nặng — bắt buộc cờ xác nhận (mẫu --confirm-tts).
  if (!confirmRender) {
    console.error('🛑 MISSING_RENDER_CONFIRM');
    console.error('  Render video là thao tác nặng — chạy lại kèm cờ --confirm-render.');
    return 5;
  }

  let result: RenderResult;
  try {
    console.log('Rendering via ffmpeg (in-process)...');
    result = renderVideo(plan, { jobDir, baseDir: process.cwd() });
  } catch (e) {
    console.error(`🛑 RENDER_FAILED: ${(e as Error).message}`);
    return 6;
  }

  // Ghi render_report.json (durationSec + subtitleTiming + warnings).
  const report = {
    reportVersion: 'v1',
    jobId,
    durationSec: result.durationSec,
    subtitleTiming: result.subtitleTiming,
    warnings: result.warnings,
    outputPath: result.outputPath,
    generatedAt: isoNow(),
  };
  mkdirSync(jobDir, { recursive: true });
  writeFileSync(
    resolve(jobDir, 'render_report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  // Cập nhật manifest: trỏ preview + chuyển state chờ Operator duyệt.
  manifest.artifacts.previewVideoPath = plan.output.path;
  manifest.state = 'READY_FOR_OPERATOR_REVIEW';
  // Render thành công → xoá vệt lỗi cũ (cùng convention với finalize-step).
  manifest.lastError = null;
  saveManifest(manifest);

  console.log(`✅ preview.mp4 rendered — ${result.durationSec.toFixed(2)}s.`);
  for (const w of result.warnings) console.log(`   ⚠️  ${w}`);
  console.log('   State → READY_FOR_OPERATOR_REVIEW. No publish (Operator duyệt + đăng tay).');
  console.log(`   Generated at ${isoNow()}`);
  return 0;
}
