// H6 — STEP 1: Vision analysis gate (verbatim move từ review-video-orchestrator
// dòng 969–1004; Round 52 — vision bắt buộc). Thiếu artifact: có --confirm-openai
// → spawn job:vision; không → exit 19. Subprocess fail → exit 20.
// N4: reloadManifest() ngay sau subprocess (job:vision có thể ghi manifest).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function visionGate(ctx: PipelineContext): void {
  if (!ctx.jobId || !ctx.jobOutputDir) return;
  const { jobId } = ctx;

  const visionArtPath = join(ctx.jobOutputDir, 'video_visual_analysis.json');
  if (existsSync(visionArtPath)) return;

  if (ctx.confirmOpenAi) {
    const vStatus = runCommand('STEP 1 — OpenAI Vision analysis (job-native)', 'pnpm', [
      'job:vision',
      '--job',
      jobId,
      '--confirm-openai',
    ]);
    ctx.reloadManifest(); // N4 — subprocess vừa ghi đĩa, đồng bộ lên memory
    if (vStatus !== 0 || !existsSync(visionArtPath)) {
      console.log('🛑 VISION_FAILED');
      if (ctx.jobManifest) {
        ctx.jobManifest.state = 'FAILED';
        ctx.jobManifest.lastError = 'VISION_FAILED';
        saveManifest(ctx.jobManifest);
        updateRegistryFromManifest(ctx.jobManifest);
      }
      writeStatusArtifact({ ...ctx.baseArtifact, state: 'VISION_FAILED' });
      process.exit(20);
    }
  } else {
    console.log('🛑 VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
    console.log(`Job ${jobId} has no video_visual_analysis.json and OpenAI is not authorized.`);
    console.log('Operator action:');
    console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
    console.log(`  (or: pnpm job:vision --job ${jobId} --confirm-openai)`);
    writeStatusArtifact({
      ...ctx.baseArtifact,
      state: 'VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
    });
    process.exit(19);
  }
}
