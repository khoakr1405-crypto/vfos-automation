// H12 — VOICE DURATION GATE (verbatim move từ review-video-orchestrator dòng
// 1315–1377). Voice dài hơn video−0.5s → BLOCK render, exit 10; PASS → ghi
// manifest.duration.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { getVideoDuration, getVoiceDuration } from '../../core/media-probe.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function durationGate(ctx: PipelineContext): void {
  const { jobId, jobSourceVideoAbs, jobManifest } = ctx;
  if (!(jobId && jobSourceVideoAbs && existsSync(jobSourceVideoAbs) && ctx.jobOutputDir)) return;

  const sourceVideoDurationSec = getVideoDuration(jobSourceVideoAbs);
  const jobVoiceoverPath = join(ctx.jobOutputDir, 'voiceover.mp3');
  let voiceDurationSec = 0;
  if (existsSync(jobVoiceoverPath)) {
    voiceDurationSec = getVoiceDuration(jobVoiceoverPath);
  }

  console.log('\n======================================================');
  console.log('⏱️  VFOS Duration Matching Gate');
  console.log('======================================================');
  console.log(`Source video duration: ${sourceVideoDurationSec.toFixed(2)}s`);
  console.log(`Voiceover duration:    ${voiceDurationSec.toFixed(2)}s`);

  const maxAllowedVoiceSec = sourceVideoDurationSec - 0.5;
  console.log(`Max allowed voice:     ${maxAllowedVoiceSec.toFixed(2)}s (video - 0.5s safety)`);

  let durationMatchStatus: 'PASS' | 'FAIL' = 'PASS';
  if (voiceDurationSec > maxAllowedVoiceSec) {
    durationMatchStatus = 'FAIL';
    console.log('🛑 FAIL: VOICE_LONGER_THAN_VIDEO');
    console.log(
      `Voice duration (${voiceDurationSec.toFixed(2)}s) exceeds max allowed (${maxAllowedVoiceSec.toFixed(2)}s).`,
    );
    console.log('To prevent cutting off speech at the end of render, rendering is BLOCKED.');

    if (jobManifest) {
      jobManifest.duration = {
        sourceVideoDurationSec,
        voiceDurationSec,
        captionedPreviewDurationSec: null,
        durationMatchStatus,
      };
      jobManifest.state = 'FAILED';
      jobManifest.lastError = 'VOICE_LONGER_THAN_VIDEO';
      saveManifest(jobManifest);
      updateRegistryFromManifest(jobManifest);
    }

    writeStatusArtifact({
      ...ctx.baseArtifact,
      elevenLabsApiCalled: ctx.elevenLabsApiCalled,
      chayExecuted: false,
      captionExecuted: false,
      state: 'VOICE_LONGER_THAN_VIDEO',
    });
    process.exit(10);
  } else {
    console.log('🟢 PASS: Voiceover duration fits within source video duration.');
    if (jobManifest) {
      jobManifest.duration = {
        sourceVideoDurationSec,
        voiceDurationSec,
        captionedPreviewDurationSec: null,
        durationMatchStatus,
      };
      saveManifest(jobManifest);
      updateRegistryFromManifest(jobManifest);
    }
  }
  console.log('======================================================\n');
}
