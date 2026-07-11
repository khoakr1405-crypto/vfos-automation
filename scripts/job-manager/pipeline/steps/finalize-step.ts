// H21 — SUCCESS finalize (verbatim move từ review-video-orchestrator dòng
// 1888–1932). Job mode: trỏ artifacts + state READY_FOR_OPERATOR_REVIEW +
// registry. Ghi status artifact cuối + banner. Exit 0.

import { saveManifest } from '../../core/manifest-io.js';
import { JOBS_ROOT } from '../../core/paths.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import { type PipelineContext, VIDEO_FIXTURE_PATH, VOICE_FIXTURE_PATH } from '../context.js';
import { printDivider, printHeader } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function finalizeStep(ctx: PipelineContext): void {
  const { jobId, preset, runId } = ctx;

  if (jobId && ctx.jobManifest) {
    // Job mode: paths point to job folder.
    const previewRel = `${JOBS_ROOT}/${jobId}/preview.mp4`;
    const captionedRel = `${JOBS_ROOT}/${jobId}/preview_with_captions${preset === 'viral_review_v2' ? '_v2' : ''}.mp4`;
    ctx.jobManifest.artifacts.previewVideoPath = previewRel;
    ctx.jobManifest.artifacts.captionedPreviewPath = captionedRel;
    ctx.jobManifest.state = 'READY_FOR_OPERATOR_REVIEW';
    saveManifest(ctx.jobManifest);
    updateRegistryFromManifest(ctx.jobManifest);
  }

  writeStatusArtifact({
    ...ctx.baseArtifact,
    elevenLabsApiCalled: ctx.elevenLabsApiCalled,
    chayExecuted: ctx.chayExecuted,
    captionExecuted: ctx.captionExecuted,
    outputVideoPath: ctx.outputExists ? ctx.expectedOutput : null,
    previewArtifact: ctx.previewArtifact,
    state: 'READY_FOR_OPERATOR_VIDEO_REVIEW',
  });

  console.log('');
  printHeader('🎬 VFOS REVIEW VIDEO READY');
  if (jobId) console.log(`Job ID:           ${jobId}`);
  console.log(`Run ID:           ${runId}`);
  console.log(
    `Video source:     ${jobId && ctx.jobSourceVideoAbs ? ctx.jobSourceVideoAbs : VIDEO_FIXTURE_PATH}`,
  );
  console.log(`Voice source:     ${jobId ? ctx.jobVoicePath : VOICE_FIXTURE_PATH}`);
  console.log(`Caption preset:   ${preset}`);
  console.log(`Output:           ${ctx.expectedOutput}`);
  if (jobId) {
    console.log('Job state:        READY_FOR_OPERATOR_REVIEW');
    console.log('Render mode:      NATIVE_JOB_FOLDER (no shared fixture bridge)');
  }
  console.log('');
  console.log('Required action:');
  console.log('Operator must watch this video before publish readiness.');
  if (jobId) {
    console.log('Unified pipeline gates passed: Vision → Script → BGM → Voice(coupled) →');
    console.log('Render → Caption → AudioGuard → BgmGuard → Final QA/STT. ✅');
  }
  printDivider();
  process.exit(0);
}
