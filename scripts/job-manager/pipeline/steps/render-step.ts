// H14 — STEP 2: render preview (verbatim move từ review-video-orchestrator dòng
// 1529–1593). Job mode: ghi render_manifest.json → spawn offline-render-video-demo
// trực tiếp (Round 38). No-job mode: pnpm chay (full pipeline). Fail → exit theo
// status subprocess. N4: reloadManifest() sau subprocess render.

import { mkdirSync, writeFileSync } from 'node:fs';
import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function renderStep(ctx: PipelineContext): void {
  const {
    jobId,
    jobSourceVideoAbs,
    jobOutputDir,
    jobRenderManifestPath,
    jobPreviewArtifactPath,
    jobPreviewPath,
    jobVoicePath,
    runId,
  } = ctx;

  if (
    jobId &&
    jobSourceVideoAbs &&
    jobOutputDir &&
    jobRenderManifestPath &&
    jobPreviewArtifactPath &&
    jobPreviewPath &&
    jobVoicePath
  ) {
    // ---- JOB MODE: direct offline-render-video into job folder (Round 38) ----
    mkdirSync(jobOutputDir, { recursive: true });

    // Write the render manifest for offline-render-video. assets.bgm reflects the
    // Round 51A BGM selection so the renderer mixes voice + BGM under the voiceover.
    const jobRenderManifest = {
      renderVersion: 'v1',
      jobId,
      runId,
      output: { expectedPreviewPath: jobPreviewPath },
      renderOptions: { estimatedDurationSec: 28, resolution: '1080x1920', aspectRatio: '9:16' },
      assets: { bgm: ctx.bgmRenderAsset },
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(jobRenderManifestPath, `${JSON.stringify(jobRenderManifest, null, 2)}\n`, 'utf8');

    const renderArgs = [
      'tsx',
      'scripts/offline-render-video-demo.ts',
      '--render',
      jobRenderManifestPath,
      '--output',
      jobPreviewArtifactPath,
      '--mode',
      'local-preview',
      '--input-video',
      jobSourceVideoAbs,
      '--input-audio',
      jobVoicePath,
    ];
    const renderStatus = runCommand(
      'STEP 2/3 — Render preview (job-native, no shared fixture bridge)',
      'npx',
      renderArgs,
    );
    ctx.reloadManifest(); // N4 — renderer/bgm-mix có thể đã ghi artifact xuống đĩa
    if (renderStatus !== 0) {
      console.log('🛑 RENDER_FAILED');
      if (ctx.jobManifest) {
        ctx.jobManifest.state = 'FAILED';
        saveManifest(ctx.jobManifest);
        updateRegistryFromManifest(ctx.jobManifest);
      }
      writeStatusArtifact({
        ...ctx.baseArtifact,
        elevenLabsApiCalled: ctx.elevenLabsApiCalled,
        state: 'RENDER_FAILED',
      });
      process.exit(renderStatus);
    }
    ctx.chayExecuted = true;
  } else {
    // ---- NO-JOB MODE: use pnpm chay (full pipeline, unchanged) ----
    const chayStatus = runCommand('STEP 2/3 — Render preview via pnpm chay', 'pnpm', ['chay']);
    if (chayStatus !== 0) {
      console.log('🛑 RENDER_FAILED');
      writeStatusArtifact({
        ...ctx.baseArtifact,
        elevenLabsApiCalled: ctx.elevenLabsApiCalled,
        state: 'RENDER_FAILED',
      });
      process.exit(chayStatus);
    }
    ctx.chayExecuted = true;
  }
}
