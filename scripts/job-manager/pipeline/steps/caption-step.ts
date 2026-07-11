// H17 — STEP 3: burn kinetic captions (verbatim move từ review-video-orchestrator
// dòng 1679–1745). Job mode: scrub chữ Trung (subtitle:detect, best-effort, mặc
// định BẬT) → caption:kinetic --cover-mode delogo. No-job mode: caption theo run.
// Fail → exit theo status subprocess. N4: reloadManifest() sau các subprocess
// (kinetic renderer sync captionedPreviewPath vào manifest qua job-manifest-helper).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { JOBS_ROOT } from '../../core/paths.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function captionStep(ctx: PipelineContext): void {
  const { jobId, jobPreviewPath, jobCaptionedPath, jobCaptionPlanPath, jobAssPath, preset } = ctx;

  if (jobId && jobPreviewPath && jobCaptionedPath && jobCaptionPlanPath && jobAssPath) {
    // ---- JOB MODE: direct caption:kinetic with job-local paths ----
    // Source-subtitle scrub: MẶC ĐỊNH BẬT cho job. Tắt qua --skip-scrub-subtitle
    // HOẶC manifest scrubSourceSubtitle=false. Best-effort: detect lỗi → render
    // tiếp KHÔNG che. KHÔNG publish; preview vẫn là cổng duyệt cuối.
    const scrubSub = ctx.jobManifest?.scrubSourceSubtitle !== false && !ctx.skipScrubSubtitle;
    if (scrubSub) {
      const maskAbs = resolve(JOBS_ROOT, jobId, 'source_subtitle_mask.json');
      if (!existsSync(maskAbs)) {
        const detectStatus = runCommand(
          'STEP 2.7 — Source subtitle scrub: detect (tesseract.js)',
          'pnpm',
          ['subtitle:detect', '--job', jobId],
        );
        ctx.reloadManifest(); // N4
        if (detectStatus !== 0) {
          console.warn(
            '⚠️ SUBTITLE_DETECT_SKIPPED — detect lỗi, render tiếp KHÔNG che phụ đề Trung.',
          );
        }
      }
    }
    const captionArgs = ['caption:kinetic', '--job', jobId, '--preset', preset];
    if (scrubSub) captionArgs.push('--cover-mode', 'delogo');
    const captionStatus = runCommand(
      'STEP 3/3 — Burn kinetic captions (job-native)',
      'pnpm',
      captionArgs,
    );
    ctx.reloadManifest(); // N4 — kinetic renderer vừa sync manifest xuống đĩa
    if (captionStatus !== 0) {
      console.log('🛑 CAPTION_FAILED');
      if (ctx.jobManifest) {
        ctx.jobManifest.state = 'FAILED';
        saveManifest(ctx.jobManifest);
        updateRegistryFromManifest(ctx.jobManifest);
      }
      writeStatusArtifact({
        ...ctx.baseArtifact,
        elevenLabsApiCalled: ctx.elevenLabsApiCalled,
        chayExecuted: ctx.chayExecuted,
        state: 'CAPTION_FAILED',
      });
      process.exit(captionStatus);
    }
    ctx.captionExecuted = true;
  } else {
    // ---- NO-JOB MODE: use standard caption:kinetic (unchanged) ----
    const captionStatus = runCommand('STEP 3/3 — Burn kinetic captions', 'pnpm', [
      'caption:kinetic',
      '--run',
      ctx.runId,
      '--preset',
      preset,
    ]);
    if (captionStatus !== 0) {
      console.log('🛑 CAPTION_FAILED');
      writeStatusArtifact({
        ...ctx.baseArtifact,
        elevenLabsApiCalled: ctx.elevenLabsApiCalled,
        chayExecuted: ctx.chayExecuted,
        state: 'CAPTION_FAILED',
      });
      process.exit(captionStatus);
    }
    ctx.captionExecuted = true;
  }
}
