// H4 — DRY-RUN plan printer (verbatim move từ review-video-orchestrator dòng
// 857–951). In kế hoạch unified Round 52, KHÔNG chạy lệnh, exit 0.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JOBS_ROOT } from '../../core/paths.js';
import { type PipelineContext, VIDEO_FIXTURE_PATH } from '../context.js';
import { printDivider } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function dryRunPlan(ctx: PipelineContext): void {
  if (!ctx.dryRun) return;
  const {
    jobId,
    jobManifest,
    jobSourceVideoPresent,
    scriptPresent,
    jobVoicePresent,
    confirmOpenAi,
    confirmElevenLabs,
    sharedVideoFixturePresent,
    voiceFixturePresent,
    effectiveVideoPresent,
    effectiveVoicePresent,
    jobOutputDir,
    jobPreviewPath,
    expectedOutput,
    runDir,
    preset,
    runId,
  } = ctx;

  console.log('UNIFIED PLAN (Round 52 — Vision→Script→BGM→Voice→Render→Caption→Guards→QA):');
  if (jobId) {
    const visionDryPresent = existsSync(join(JOBS_ROOT, jobId, 'video_visual_analysis.json'));
    const bgmFilesPresent =
      existsSync(resolve('production/fixtures/bgm')) &&
      existsSync(resolve('production/fixtures/bgm/bgm_001.mp3'));
    console.log(
      `  Confirm flags                  -> OpenAI=${confirmOpenAi ? 'YES' : 'NO'} | ElevenLabs=${confirmElevenLabs ? 'YES' : 'NO'}`,
    );
    console.log(`  0. Job manifest present?       -> ${jobManifest ? 'YES' : 'NO (UNKNOWN_JOB)'}`);
    console.log(`  0. Job source video present?   -> ${jobSourceVideoPresent ? 'YES' : 'NO'}`);
    console.log(
      `  1. Vision present / will run?  -> ${visionDryPresent ? 'PRESENT' : confirmOpenAi ? 'WILL RUN (job:vision)' : 'BLOCK (needs --confirm-openai)'}`,
    );
    console.log(
      `  2. Script present / will run?  -> ${scriptPresent ? 'PRESENT' : confirmOpenAi ? 'WILL RUN (job:script)' : 'BLOCK (needs --confirm-openai)'}`,
    );
    console.log(
      `  3. BGM files / will select?    -> ${bgmFilesPresent ? 'WILL SELECT (mood→voiceDirection)' : 'BLOCK (BGM_LIBRARY_FILES_MISSING)'}`,
    );
    console.log(
      `  4. Voice present / coupling?   -> ${jobVoicePresent ? 'PRESENT (BGM-coupled check)' : confirmElevenLabs ? 'WILL RUN (voice:elevenlabs)' : 'BLOCK (needs --confirm-elevenlabs)'}`,
    );
    console.log(
      `  9. Final QA / STT?             -> ${confirmOpenAi ? 'WILL RUN (job:qa, must PASS)' : 'BLOCK (needs --confirm-openai)'}`,
    );
    console.log('  Will publish?                  -> NO (never)');
  } else {
    console.log(
      `  1. Shared video fixture?        -> ${sharedVideoFixturePresent ? 'PRESENT' : 'MISSING'}`,
    );
    console.log(
      `  3. Voice fixture (shared)?      -> ${voiceFixturePresent ? 'PRESENT' : 'MISSING'}`,
    );
  }

  const willCallVoice = jobId
    ? !jobVoicePresent && confirmElevenLabs
    : !voiceFixturePresent && confirmElevenLabs;
  const canProceed = effectiveVideoPresent && (effectiveVoicePresent || willCallVoice);

  console.log('  4. Will use shared fixture bridge? -> NO (native job render — Round 38/39)');
  console.log(`  5. Native job output dir?       -> ${jobOutputDir ?? 'N/A (no-job mode)'}`);
  console.log(
    `  6. Will call ElevenLabs API?    -> ${willCallVoice ? 'YES (authorized via --confirm-elevenlabs)' : 'NO'}`,
  );
  console.log(
    `  7. Will run pnpm chay?          -> ${!jobId && canProceed ? 'YES (no-job pipeline)' : 'NO'}`,
  );
  console.log(
    `  8. Will run offline-render-video? -> ${jobId && canProceed ? 'YES (direct, job mode)' : 'NO'}`,
  );
  console.log(
    `  9. Will run kinetic caption?    -> ${canProceed ? `YES (preset=${preset})` : 'NO'}`,
  );
  console.log(` 10. Will update job manifest?    -> ${canProceed && jobId ? 'YES' : 'NO'}`);
  console.log(
    ` 11. Expected preview path        -> ${jobId ? (jobPreviewPath ?? '?') : `${runDir}/preview.mp4`}`,
  );
  console.log(` 12. Expected captioned path       -> ${expectedOutput}`);

  if (jobId && !jobManifest) {
    console.log('\nBlocker: UNKNOWN_JOB');
    console.log('  Action: pnpm job:list   then verify --job <jobId>');
  } else if (jobId && !jobSourceVideoPresent) {
    console.log('\nBlocker: MISSING_JOB_SOURCE_VIDEO');
    console.log(`  Action: pnpm job:attach-source --job ${jobId} --file "<path-to-video>"`);
  } else if (jobId && !scriptPresent) {
    console.log('\nBlocker: MISSING_JOB_SCRIPT_ARTIFACT');
    console.log(`  Action: pnpm job:script --job ${jobId}`);
  } else if (!jobId && !sharedVideoFixturePresent) {
    console.log('\nBlocker: MISSING_REAL_PRODUCT_VIDEO_FIXTURE');
    console.log(`  Action: copy real product video to ${VIDEO_FIXTURE_PATH}`);
  }

  if (jobId && !jobVoicePresent && !confirmElevenLabs) {
    console.log('\nBlocker: MISSING_JOB_VOICEOVER');
    console.log('  Action: rerun with --confirm-elevenlabs to generate job-local voiceover');
    console.log(`          or run: pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);
  } else if (!jobId && !voiceFixturePresent && !confirmElevenLabs) {
    console.log('\nBlocker: MISSING_VOICEOVER_FIXTURE');
    console.log('  Action: rerun with --confirm-elevenlabs to generate shared voiceover');
    console.log(
      `          or run: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`,
    );
  }
  printDivider();
  console.log('Dry-run complete. No commands executed, no files modified.');
  writeStatusArtifact({ ...ctx.baseArtifact, state: 'DRY_RUN_PLAN_ONLY' });
  process.exit(0);
}
