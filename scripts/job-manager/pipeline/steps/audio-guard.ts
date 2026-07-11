// H15 + H18 — AudioGuard (verbatim move từ review-video-orchestrator dòng
// 1595–1623 và 1747–1786). 2 lần kiểm audio stream với exit code KHÁC NHAU
// (giữ nguyên như cũ): preview → exit 9; captioned → exit 10 (+ ghi duration).

import { join } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { validateAudioStream } from '../../core/media-probe.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function previewAudioGuard(ctx: PipelineContext): void {
  const previewPathToCheck =
    ctx.jobId && ctx.jobPreviewPath ? ctx.jobPreviewPath : join(ctx.runDir, 'preview.mp4');
  console.log(`\n🔍 [AudioGuard] Running audio stream check on preview: ${previewPathToCheck}...`);
  const previewAudioCheck = validateAudioStream(previewPathToCheck);
  if (!previewAudioCheck.success) {
    console.log('🛑 Audio check failed: REVIEW_PREVIEW_AUDIO_MISSING');
    console.log(`Reason: ${previewAudioCheck.reason || 'No audio stream or duration is 0'}`);
    console.log('Suggestion: run the following command to diagnose the video:');
    console.log(
      `  ffprobe -v error -show_entries stream=index,codec_type,codec_name,duration -show_format -of json "${previewPathToCheck}"`,
    );

    if (ctx.jobId && ctx.jobManifest) {
      ctx.jobManifest.state = 'FAILED';
      ctx.jobManifest.lastError = 'REVIEW_PREVIEW_AUDIO_MISSING';
      saveManifest(ctx.jobManifest);
      updateRegistryFromManifest(ctx.jobManifest);
    }

    writeStatusArtifact({
      ...ctx.baseArtifact,
      elevenLabsApiCalled: ctx.elevenLabsApiCalled,
      chayExecuted: ctx.chayExecuted,
      state: 'REVIEW_PREVIEW_AUDIO_MISSING',
    });
    process.exit(9);
  } else {
    console.log('✅ [AudioGuard] Preview audio stream OK.');
  }
}

export function captionedAudioGuard(ctx: PipelineContext): void {
  const { expectedOutput } = ctx;
  console.log(
    `\n🔍 [AudioGuard] Running audio stream check on captioned output: ${expectedOutput}...`,
  );
  const captionedAudioCheck = validateAudioStream(expectedOutput);
  if (!captionedAudioCheck.success) {
    console.log('🛑 Audio check failed: CAPTIONED_PREVIEW_AUDIO_MISSING');
    console.log(`Reason: ${captionedAudioCheck.reason || 'No audio stream or duration is 0'}`);
    console.log('Suggestion: run the following command to diagnose the video:');
    console.log(
      `  ffprobe -v error -show_entries stream=index,codec_type,codec_name,duration -show_format -of json "${expectedOutput}"`,
    );

    if (ctx.jobId && ctx.jobManifest) {
      ctx.jobManifest.state = 'FAILED';
      ctx.jobManifest.lastError = 'CAPTIONED_PREVIEW_AUDIO_MISSING';
      saveManifest(ctx.jobManifest);
      updateRegistryFromManifest(ctx.jobManifest);
    }

    writeStatusArtifact({
      ...ctx.baseArtifact,
      elevenLabsApiCalled: ctx.elevenLabsApiCalled,
      chayExecuted: ctx.chayExecuted,
      captionExecuted: ctx.captionExecuted,
      state: 'CAPTIONED_PREVIEW_AUDIO_MISSING',
    });
    process.exit(10);
  } else {
    console.log('✅ [AudioGuard] Captioned output audio stream OK.');
    if (ctx.jobId && ctx.jobManifest?.duration) {
      ctx.jobManifest.duration.captionedPreviewDurationSec = captionedAudioCheck.duration || null;
      saveManifest(ctx.jobManifest);
    }
  }
}
