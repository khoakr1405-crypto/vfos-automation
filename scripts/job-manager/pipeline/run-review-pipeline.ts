// run-review-pipeline — thay hàm main() 1300 dòng của review-video-orchestrator
// (God-file anatomy N3). Gọi TUẦN TỰ các step đúng thứ tự bản cũ; mỗi step tự
// side-effect + process.exit như nguyên bản. Layering: pipeline → steps → core.

import { basename } from 'node:path';
import { JOBS_ROOT } from '../core/paths.js';
import { type PipelineContext, buildBaseArtifact } from './context.js';
import { VIDEO_FIXTURE_PATH, VOICE_FIXTURE_PATH } from './context.js';
import { printDivider, printHeader } from './run-step.js';
import { captionedAudioGuard, previewAudioGuard } from './steps/audio-guard.js';
import { autoApproveGate } from './steps/auto-approve-gate.js';
import { bgmGate } from './steps/bgm-gate.js';
import { bgmMixGuard } from './steps/bgm-mix-guard.js';
import { bgmPreselect } from './steps/bgm-preselect.js';
import { captionStep } from './steps/caption-step.js';
import { cleanSourceGate } from './steps/clean-source-gate.js';
import { dryRunPlan } from './steps/dry-run-plan.js';
import { durationGate } from './steps/duration-gate.js';
import { finalQaGate } from './steps/final-qa-gate.js';
import { finalizeStep } from './steps/finalize-step.js';
import { fixtureGate } from './steps/fixture-gate.js';
import { jobSanityGate } from './steps/job-sanity-gate.js';
import { productFromVideoGate } from './steps/product-from-video-gate.js';
import { renderStep } from './steps/render-step.js';
import { scriptGate } from './steps/script-gate.js';
import { scriptQualityGate } from './steps/script-quality-gate.js';
import { verifyRealFixture } from './steps/verify-real-fixture.js';
import { visionGate } from './steps/vision-gate.js';
import { voiceGate } from './steps/voice-gate.js';

/** In banner mở màn (verbatim từ main() cũ dòng 801–832). */
function printRunBanner(ctx: PipelineContext): void {
  printHeader('🎬  VFOS Review Video Orchestrator');
  console.log(
    `Mode:                   ${ctx.jobId ? `JOB (${ctx.jobId})` : 'NO-JOB (shared fixtures)'}`,
  );
  console.log(`Run ID:                 ${ctx.runId}`);
  console.log(`Caption preset:         ${ctx.preset}`);
  console.log(`Action:                 ${ctx.dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log(
    `Allow ElevenLabs API:   ${ctx.confirmElevenLabs ? '✅ YES' : '❌ NO (default safe)'}`,
  );
  printDivider();
  if (ctx.jobId) {
    if (!ctx.jobManifest) {
      console.log(`Job manifest:           ${JOBS_ROOT}/${ctx.jobId}/job_manifest.json  ❌`);
    } else {
      console.log(`Job manifest:           ${JOBS_ROOT}/${ctx.jobId}/job_manifest.json  ✅`);
      console.log(`Job state (current):    ${ctx.jobManifest.state}`);
      console.log(
        `Job source video:       ${ctx.jobManifest.source.sourceVideoPath ?? '(none)'}  ${ctx.jobSourceVideoPresent ? '✅' : '❌'}`,
      );
      console.log(
        `Job script:             ${JOBS_ROOT}/${ctx.jobId}/script_artifact.json  ${ctx.scriptPresent ? '✅' : '❌'}`,
      );
      console.log(
        `Job voiceover:          ${JOBS_ROOT}/${ctx.jobId}/voiceover.mp3  ${ctx.jobVoicePresent ? '✅' : '❌'}`,
      );
    }
  } else {
    console.log(
      `Video fixture:          ${VIDEO_FIXTURE_PATH}  ${ctx.sharedVideoFixturePresent ? '✅' : '❌'}`,
    );
    console.log(
      `Voice fixture (shared): ${VOICE_FIXTURE_PATH}  ${ctx.voiceFixturePresent ? '✅' : '❌'}`,
    );
  }
  printDivider();
}

export function runReviewPipeline(ctx: PipelineContext): void {
  // H2 — clean-source gate + manifest trace surgery (chạy TRƯỚC banner, như cũ)
  cleanSourceGate(ctx);

  // Nguồn hiệu dụng (dòng 796–799 cũ): job → nguồn job; no-job → shared fixture.
  ctx.effectiveVideoPresent = ctx.jobId
    ? Boolean(ctx.jobSourceVideoPresent)
    : ctx.sharedVideoFixturePresent;
  ctx.effectiveVoicePresent = ctx.jobId ? ctx.jobVoicePresent : ctx.voiceFixturePresent;

  // H3 — banner + baseArtifact (dựng SAU clean-source, đúng giá trị như cũ)
  printRunBanner(ctx);
  ctx.baseArtifact = buildBaseArtifact({
    runId: ctx.runId,
    jobId: ctx.jobId,
    preset: ctx.preset,
    videoFixturePresent: ctx.sharedVideoFixturePresent,
    voiceFixturePresent: ctx.effectiveVoicePresent,
    jobSourceVideoPresent: ctx.jobSourceVideoPresent,
  });

  // H4 — dry-run: in kế hoạch rồi exit 0 (không chạy gì thêm)
  dryRunPlan(ctx);

  // H5–H8 — chuỗi gate job mode (mỗi step tự no-op khi !jobId, như if(jobId) cũ)
  // Phần 78 — STEP 0 TRƯỚC sanity: job video-first chưa card → tự nhận dạng
  // sản phẩm + Market-Fit + attach; job có card → no-op (sanity giữ backstop).
  productFromVideoGate(ctx);
  jobSanityGate(ctx);
  visionGate(ctx);
  scriptGate(ctx);
  scriptQualityGate(ctx);

  // H9 — gate fixture (chỉ chạm được ở no-job mode)
  fixtureGate(ctx);

  // H10–H13 — BGM pre-select → voice → duration → BGM gate + coupling
  bgmPreselect(ctx);
  voiceGate(ctx);
  durationGate(ctx);
  bgmGate(ctx);

  // H14–H18 — render → audio guard → bgm mix guard → caption → audio guard
  renderStep(ctx);
  previewAudioGuard(ctx);
  bgmMixGuard(ctx);
  captionStep(ctx);
  captionedAudioGuard(ctx);

  // Print successful guardrail check logs in the exact format requested (cũ 1783–1786)
  console.log('\nAudio check:');
  console.log('- preview.mp4: AUDIO PRESENT');
  console.log(`- ${basename(ctx.expectedOutput)}: AUDIO PRESENT`);

  // H19–H21 — verify fixture thật → Final QA/STT → finalize (exit 0)
  verifyRealFixture(ctx);
  finalQaGate(ctx);
  // Phần 82 — cổng AI auto-approve (config off → no-op; PASS → finalize tự duyệt)
  autoApproveGate(ctx);
  finalizeStep(ctx);
}
