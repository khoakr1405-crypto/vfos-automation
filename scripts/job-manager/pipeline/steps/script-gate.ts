// H7 — STEP 2: AI script gate (verbatim move từ review-video-orchestrator dòng
// 1006–1048; Round 52 — auto-run với consent). Thiếu script: --confirm-openai →
// spawn job:script (fail → exit 21); không → exit 8.
// N4: reloadManifest() sau subprocess — job:script GHI scriptArtifactPath vào FILE;
// bản cũ giữ manifest in-memory cũ nên các save sau ghi đè về null (root cause
// SCRIPT_ARTIFACT_MISSING giả). Reload + giữ dòng resync (idempotent, belt&braces).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { JOBS_ROOT } from '../../core/paths.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function scriptGate(ctx: PipelineContext): void {
  if (!ctx.jobId || !ctx.jobOutputDir) return;
  const { jobId } = ctx;

  if (!ctx.scriptPresent) {
    if (ctx.confirmOpenAi) {
      const sStatus = runCommand('STEP 2 — AI script (job-native)', 'pnpm', [
        'job:script',
        '--job',
        jobId,
        '--confirm-openai',
      ]);
      ctx.reloadManifest(); // N4 — job:script vừa ghi manifest + artifact xuống đĩa
      ctx.scriptPresent = existsSync(join(ctx.jobOutputDir, 'script_artifact.json'));
      if (sStatus !== 0 || !ctx.scriptPresent) {
        console.log('🛑 SCRIPT_GENERATION_FAILED');
        if (ctx.jobManifest) {
          ctx.jobManifest.state = 'FAILED';
          ctx.jobManifest.lastError = 'SCRIPT_GENERATION_FAILED';
          saveManifest(ctx.jobManifest);
          updateRegistryFromManifest(ctx.jobManifest);
        }
        writeStatusArtifact({ ...ctx.baseArtifact, state: 'SCRIPT_GENERATION_FAILED' });
        process.exit(21);
      }
    } else {
      console.log('🛑 SCRIPT_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
      console.log(`Job ${jobId} has no script artifact and OpenAI is not authorized.`);
      console.log('Operator action:');
      console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
      console.log(`  (or: pnpm job:script --job ${jobId} --confirm-openai)`);
      writeStatusArtifact({
        ...ctx.baseArtifact,
        state: 'SCRIPT_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
      });
      process.exit(8);
    }
  }

  // Resync scriptArtifactPath vào manifest in-memory (giữ từ bản cũ — sau N4 reload
  // gần như luôn đúng sẵn, giữ lại như lưới an toàn idempotent).
  if (ctx.jobManifest && existsSync(join(ctx.jobOutputDir, 'script_artifact.json'))) {
    ctx.jobManifest.artifacts.scriptArtifactPath = `${JOBS_ROOT}/${jobId}/script_artifact.json`;
  }
}
