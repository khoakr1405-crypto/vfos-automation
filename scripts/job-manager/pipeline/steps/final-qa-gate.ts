// H20 — STEP 9: Final QA / STT gate (verbatim move từ review-video-orchestrator
// dòng 1829–1886; Round 52 — QA bắt buộc trước READY). Thiếu consent → exit 22;
// QA không PASS → exit 23. PASS → reload manifest (giữ qa fields) vào ctx.

import { loadManifest, saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function finalQaGate(ctx: PipelineContext): void {
  const { jobId } = ctx;
  if (!(jobId && ctx.jobManifest)) return;
  const jobManifest = ctx.jobManifest;

  console.log('\n======================================================');
  console.log('🧪  VFOS Final QA / STT Gate (Round 52)');
  console.log('======================================================');
  if (!ctx.confirmOpenAi) {
    console.log('🛑 FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
    console.log('Final STT QA must pass before the video is offered for operator review.');
    console.log('Operator action:');
    console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
    console.log(`  (or run standalone: pnpm job:qa --job ${jobId} --confirm-openai)`);
    jobManifest.lastError = 'FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING';
    saveManifest(jobManifest);
    writeStatusArtifact({
      ...ctx.baseArtifact,
      elevenLabsApiCalled: ctx.elevenLabsApiCalled,
      chayExecuted: ctx.chayExecuted,
      captionExecuted: ctx.captionExecuted,
      outputVideoPath: ctx.outputExists ? ctx.expectedOutput : null,
      state: 'FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
    });
    process.exit(22);
  }

  const qaStatusCode = runCommand('STEP 9 — Final QA / STT', 'pnpm', [
    'job:qa',
    '--job',
    jobId,
    '--confirm-openai',
  ]);
  // Bản cũ đã reload đúng ở đây (loadJobManifest) — chính là mẫu cho fix N4.
  const qaManifest = loadManifest(jobId);
  const qaPassed = qaStatusCode === 0 && qaManifest?.qaStatus === 'PASS';
  if (!qaPassed) {
    console.log('🛑 FINAL_QA_NOT_PASSING');
    console.log(`QA exit code: ${qaStatusCode}, qaStatus: ${qaManifest?.qaStatus ?? 'unknown'}`);
    if (qaManifest) {
      qaManifest.state = 'FAILED';
      qaManifest.lastError = 'FINAL_QA_NOT_PASSING';
      saveManifest(qaManifest);
      updateRegistryFromManifest(qaManifest);
    }
    writeStatusArtifact({
      ...ctx.baseArtifact,
      elevenLabsApiCalled: ctx.elevenLabsApiCalled,
      chayExecuted: ctx.chayExecuted,
      captionExecuted: ctx.captionExecuted,
      outputVideoPath: ctx.outputExists ? ctx.expectedOutput : null,
      state: 'FINAL_QA_NOT_PASSING',
    });
    process.exit(23);
  }
  console.log('✅ Final QA / STT PASSED.');
  // Reload manifest so downstream READY write keeps qa fields.
  if (qaManifest) ctx.jobManifest = qaManifest;
}
