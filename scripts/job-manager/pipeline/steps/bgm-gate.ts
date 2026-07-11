// H13 — BGM Selection Gate + Voice↔BGM coupling (Round 51A/53) — KHỐI PHỨC TẠP
// NHẤT của orchestrator (verbatim move dòng 1379–1527, chỉ bọc thành hàm theo
// lệnh Operator; logic/thứ tự/exit code GIỮ NGUYÊN: 14/15/11).
// BGM dẫn mood; voiceover phải được sinh VỚI voice direction khớp (voice artifact
// ghi voiceDirectionApplied + voiceDirectionHash). Lệch → regen voice (consent) →
// verify lại. Thiếu file BGM thật → BLOCK trừ khi --allow-no-bgm.
// N4: reloadManifest() sau subprocess regen voice.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectBgmForJob } from '../../../job-bgm-selector.js';
import { saveManifest } from '../../core/manifest-io.js';
import { JOBS_ROOT } from '../../core/paths.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import { BGM_REQUIRED_BY_DEFAULT, type PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function bgmGate(ctx: PipelineContext): void {
  const { jobId, jobOutputDir, allowNoBgm } = ctx;
  if (!(jobId && jobOutputDir && ctx.jobManifest)) return;
  const jobManifest = ctx.jobManifest;

  console.log('\n======================================================');
  console.log('🎵  VFOS BGM Selection Gate (Round 51A)');
  console.log('======================================================');
  const bgmResult = selectBgmForJob({ jobId, jobOutputDir });
  console.log(`BGM library:           ${bgmResult.libraryPath}`);
  console.log(`Declared tracks:       ${bgmResult.libraryEntryCount}`);
  console.log(`Real audio files:      ${bgmResult.existingFileCount}`);

  if (bgmResult.status === 'OK' && bgmResult.selection) {
    const sel = bgmResult.selection;
    console.log(
      `Selected track:        ${sel.trackId} — "${sel.title}" (${sel.mood})${bgmResult.reused ? ' [sticky reuse]' : ''}`,
    );
    console.log(`BGM file:              ${sel.localAudioPath}`);
    console.log(`Energy / mood:         ${sel.energyLevel} / ${sel.matchedMood}`);
    const vd = sel.voiceDirection;
    console.log(
      `Voice direction:       ${vd.style} | pace ${vd.pace} | ${vd.delivery} (clarity-first)`,
    );
    console.log(`BGM artifact:          ${bgmResult.artifactPath}`);
    ctx.bgmRequired = true;
    ctx.bgmRenderAsset = {
      selected: true,
      trackId: sel.trackId,
      title: sel.title,
      mood: sel.mood,
      localAudioPath: sel.localAudioPath,
      volumeMultiplier: sel.volumeMultiplier,
    };
    jobManifest.artifacts.bgmArtifactPath = `${JOBS_ROOT}/${jobId}/bgm_selection_artifact.json`;
    jobManifest.bgmPolicy = 'BGM_REQUIRED';
    saveManifest(jobManifest);

    // ---- Voice ↔ BGM coupling (Round 53) ----
    // Coupling is fresh only when the voice was direction-applied for the
    // current BGM mood (voiceDirectionApplied + voiceDirectionHash khớp).
    const readVoiceCoupling = (): { applied: boolean; hash: string } => {
      const vp = join(jobOutputDir, 'voice_artifact.json');
      if (!existsSync(vp)) return { applied: false, hash: '' };
      try {
        const va = JSON.parse(readFileSync(vp, 'utf8')) as {
          voiceDirectionApplied?: boolean;
          voiceDirectionHash?: string;
        };
        return { applied: va.voiceDirectionApplied === true, hash: va.voiceDirectionHash ?? '' };
      } catch {
        return { applied: false, hash: '' };
      }
    };

    const vc = readVoiceCoupling();
    const directionFresh = vc.applied && vc.hash === sel.voiceDirectionHash;
    if (directionFresh) {
      console.log('Voice/BGM coupling:    fresh (voice direction matches current BGM mood). ✅');
    } else {
      const reason: 'VOICE_DIRECTION_NOT_APPLIED' | 'BGM_VOICE_DIRECTION_STALE' = vc.applied
        ? 'BGM_VOICE_DIRECTION_STALE'
        : 'VOICE_DIRECTION_NOT_APPLIED';
      console.log(`🛑 ${reason}`);
      console.log(
        vc.applied
          ? 'BGM mood changed since the voiceover was generated — voice direction no longer matches.'
          : 'The voiceover was not generated with BGM voice direction (legacy/plain voice).',
      );
      if (ctx.confirmElevenLabs) {
        const reStatus = runCommand(
          'STEP 4b — Regenerate voiceover with BGM voice direction',
          'pnpm',
          ['voice:elevenlabs', '--job', jobId, '--confirm-api-call'],
        );
        ctx.reloadManifest(); // N4 — regen voice vừa ghi artifact/manifest
        const after = readVoiceCoupling();
        if (reStatus !== 0 || !after.applied || after.hash !== sel.voiceDirectionHash) {
          console.log('🛑 VOICE_GENERATION_FAILED (direction not applied after regen)');
          const freshManifest = ctx.jobManifest ?? jobManifest;
          freshManifest.state = 'FAILED';
          freshManifest.lastError = 'VOICE_GENERATION_FAILED';
          saveManifest(freshManifest);
          updateRegistryFromManifest(freshManifest);
          writeStatusArtifact({
            ...ctx.baseArtifact,
            elevenLabsApiCalled: true,
            state: 'VOICE_GENERATION_FAILED',
          });
          process.exit(14);
        }
        ctx.elevenLabsApiCalled = true;
        console.log('Voice/BGM coupling:    voice regenerated WITH BGM voice direction. ✅');
      } else {
        console.log('Operator action:');
        console.log(`  pnpm chay:review --job ${jobId} --confirm-elevenlabs   (regenerate voice)`);
        console.log(
          `  or: pnpm chay:review --job ${jobId} --allow-no-bgm     (drop BGM intentionally)`,
        );
        jobManifest.state = 'FAILED';
        jobManifest.lastError = reason;
        saveManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
        writeStatusArtifact({
          ...ctx.baseArtifact,
          elevenLabsApiCalled: ctx.elevenLabsApiCalled,
          state: reason,
        });
        process.exit(15);
      }
    }
  } else {
    // No real BGM file available (library metadata may still exist).
    console.log(`🛑 ${bgmResult.status}`);
    if (bgmResult.reason) console.log(`Reason: ${bgmResult.reason}`);

    if (BGM_REQUIRED_BY_DEFAULT && !allowNoBgm) {
      console.log('Review video requires BGM by default. Rendering is BLOCKED to avoid');
      console.log('silently shipping a voiceover-only video.');
      console.log('Operator action:');
      console.log('  Add mp3 files to production/fixtures/bgm/ according to bgm_library.json,');
      console.log('  or rerun with --allow-no-bgm to render voiceover-only intentionally.');
      jobManifest.state = 'FAILED';
      jobManifest.lastError = 'BGM_LIBRARY_FILES_MISSING';
      jobManifest.bgmPolicy = 'BGM_REQUIRED';
      saveManifest(jobManifest);
      updateRegistryFromManifest(jobManifest);
      writeStatusArtifact({
        ...ctx.baseArtifact,
        elevenLabsApiCalled: ctx.elevenLabsApiCalled,
        chayExecuted: false,
        state: 'BGM_LIBRARY_FILES_MISSING',
      });
      process.exit(11);
    } else {
      console.log('⚠️  Operator override (--allow-no-bgm): rendering voiceover-only.');
      ctx.bgmRequired = false;
      ctx.bgmRenderAsset = null;
      jobManifest.bgmPolicy = 'ALLOW_NO_BGM_OPERATOR_OVERRIDE';
      saveManifest(jobManifest);
    }
  }
  console.log('======================================================\n');
}
