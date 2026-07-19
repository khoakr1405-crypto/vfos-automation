// H11 — GATE 2: voiceover (verbatim move từ review-video-orchestrator dòng
// 1249–1313). Voice picker mismatch check + thiếu voice: không consent → exit 3;
// có consent → spawn voice:elevenlabs (fail → exit theo status subprocess).
// N4: reloadManifest() sau subprocess (bridge ghi voice artifact + manifest).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

// Voice picker: nếu đã có voiceover nhưng KHÁC giọng đang chọn → tạo lại đúng giọng
// (freshness gate chỉ so hash script, không bắt được đổi giọng → check tại đây).
const VOICE_NAME_MAP = { female: 'vi-VN-HoaiMyNeural', male: 'vi-VN-NamMinhNeural' } as const;

// Phần 78b — lệnh trực tiếp Operator 2026-07-16: ElevenLabs (brand voice
// ELEVENLABS_VOICE_ID, billing payg đã thông) là GIỌNG CHÍNH THỨC lane Review.
// edge-tts chỉ còn là phương án chữa cháy: set VFOS_VOICE_PROVIDER=edge khi
// ElevenLabs kẹt billing/quota — không cần sửa code.
function resolveVoiceProvider(): 'edge' | 'elevenlabs' {
  return process.env.VFOS_VOICE_PROVIDER === 'edge' ? 'edge' : 'elevenlabs';
}

export function voiceGate(ctx: PipelineContext): void {
  const { jobId, runId, requestedVoice } = ctx;
  const voiceProvider = resolveVoiceProvider();

  let voiceMismatch = false;
  if (jobId && ctx.jobOutputDir) {
    const vaPath = join(ctx.jobOutputDir, 'voice_artifact.json');
    if (existsSync(vaPath)) {
      try {
        const va = JSON.parse(readFileSync(vaPath, 'utf8')) as {
          voice?: string;
          provider?: string;
        };
        // Đổi provider (vd edge cũ → elevenlabs mới) → voice hiện tại sai giọng
        // thương hiệu → regen. Artifact edge ghi 'edge-tts', elevenlabs ghi 'elevenlabs'.
        const artifactProvider = va.provider === 'edge-tts' ? 'edge' : va.provider;
        if (artifactProvider && artifactProvider !== voiceProvider) voiceMismatch = true;
        // Picker nam/nữ chỉ có nghĩa với edge (elevenlabs = 1 brand voice duy nhất).
        if (
          voiceProvider === 'edge' &&
          requestedVoice &&
          va.voice &&
          va.voice !== VOICE_NAME_MAP[requestedVoice]
        ) {
          voiceMismatch = true;
        }
      } catch {
        /* không đọc được → để các gate khác xử như cũ */
      }
    }
  }

  if (!ctx.effectiveVoicePresent || voiceMismatch) {
    if (!ctx.confirmElevenLabs) {
      if (jobId) {
        console.log('🛑 MISSING_JOB_VOICEOVER');
        console.log('');
        console.log(
          'Job voiceover or timing artifact not present and ElevenLabs API not authorized.',
        );
        console.log('Operator action — either:');
        console.log(`  a) pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);
        console.log(`  b) pnpm chay:review --job ${jobId} --confirm-elevenlabs`);
        writeStatusArtifact({ ...ctx.baseArtifact, state: 'MISSING_JOB_VOICEOVER' });
      } else {
        console.log('🛑 MISSING_VOICEOVER_FIXTURE');
        console.log('');
        console.log('Voiceover fixture not present and ElevenLabs API not authorized.');
        console.log('Operator action — either:');
        console.log(`  a) pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`);
        console.log('  b) pnpm chay:review --confirm-elevenlabs');
        writeStatusArtifact({ ...ctx.baseArtifact, state: 'MISSING_VOICEOVER_FIXTURE' });
      }
      process.exit(3);
    }
    const voiceArgs = jobId
      ? ['voice:elevenlabs', '--job', jobId, '--confirm-api-call']
      : ['voice:elevenlabs', '--run', runId, '--confirm-api-call', '--sync-fixture'];
    voiceArgs.push('--provider', voiceProvider);
    if (requestedVoice) voiceArgs.push('--voice', requestedVoice);

    const voiceStatus = runCommand(
      jobId
        ? 'STEP 1/3 — Generate job-local voiceover via ElevenLabs (authorized)'
        : 'STEP 1/3 — Generate voiceover via ElevenLabs (authorized)',
      'pnpm',
      voiceArgs,
    );
    ctx.reloadManifest(); // N4 — voice bridge vừa ghi artifact/manifest xuống đĩa
    if (voiceStatus !== 0) {
      console.log('🛑 VOICE_GENERATION_FAILED');
      writeStatusArtifact({ ...ctx.baseArtifact, state: 'VOICE_GENERATION_FAILED' });
      process.exit(voiceStatus);
    }
    ctx.elevenLabsApiCalled = true;
  } else {
    console.log(
      jobId
        ? 'STEP 1/3 — Job voiceover + timing artifacts present, skipping ElevenLabs call. ✅'
        : 'STEP 1/3 — Voiceover fixture present, skipping ElevenLabs call. ✅',
    );
  }
}
