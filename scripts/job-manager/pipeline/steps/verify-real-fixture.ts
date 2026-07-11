// H19 — VERIFY artifact reflects real fixture, not placeholder (verbatim move từ
// review-video-orchestrator dòng 1788–1827). Set ctx.previewArtifact +
// ctx.outputExists cho finalize. Placeholder → exit 4.

import { existsSync } from 'node:fs';
import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { readPreviewArtifact, readPreviewArtifactFromPath } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function verifyRealFixture(ctx: PipelineContext): void {
  if (ctx.jobId && ctx.jobPreviewArtifactPath) {
    // Job mode: read from job folder.
    ctx.previewArtifact = readPreviewArtifactFromPath(ctx.jobPreviewArtifactPath);
  } else {
    ctx.previewArtifact = readPreviewArtifact(ctx.runId);
  }
  ctx.outputExists = existsSync(ctx.expectedOutput);

  if (
    !ctx.previewArtifact ||
    !ctx.previewArtifact.hasRealFixture ||
    ctx.previewArtifact.offlinePlaceholderOnly
  ) {
    console.log('🛑 REAL_FIXTURE_NOT_USED');
    console.log('Render completed but preview_artifact.json still indicates placeholder mode.');
    if (ctx.jobId) {
      console.log('Operator should verify that source video is a real product video.');
    } else {
      console.log(
        'Operator should verify that pipeline-run-manifest picked up sample_hero_video.mp4.',
      );
    }
    if (ctx.jobId && ctx.jobManifest) {
      ctx.jobManifest.state = 'FAILED';
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
      state: 'REAL_FIXTURE_NOT_USED',
    });
    process.exit(4);
  }
}
