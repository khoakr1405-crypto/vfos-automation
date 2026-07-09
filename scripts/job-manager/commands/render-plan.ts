// `render-plan` command (RFC §3 — stage render-prep) — VỎ CLI có side-effect.
// Luồng: load manifest + script_artifact → edge-tts (--confirm-tts, idempotent) →
// chunkForSubtitles + alignSubtitles (pure @vfos/ai-agents) → buildRenderPlan →
// ghi render_plan.json. KHÔNG publish, KHÔNG render — chỉ chuẩn bị input cho render.
// Tái dùng: nếu ĐÃ có voiceover.mp3 + voice_timing.json (và không --force) → BỎ QUA
// gọi TTS, nạp thẳng timing từ file (tiết kiệm tài nguyên).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  alignSubtitles,
  buildRenderPlan,
  chunkForSubtitles,
} from '../../../packages/ai-agents/src/index.js';
import type { EdgeWord, SubtitleCue } from '../../../packages/ai-agents/src/index.js';
import {
  EDGE_FEMALE_VOICE,
  EDGE_MALE_VOICE,
  edgePythonExists,
  synthEdge,
} from '../../ent-vlog/lib/tts-provider.js';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { getVideoDuration } from '../core/media-probe.js';
import { JOBS_ROOT } from '../core/paths.js';

export function cmdRenderPlan(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      voice: { type: 'string' },
      'confirm-tts': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const confirmTts = Boolean(parsed.values['confirm-tts']);
  const force = Boolean(parsed.values.force);
  const dryRun = Boolean(parsed.values['dry-run']);
  const voiceChoice = parsed.values.voice === 'female' ? 'female' : 'male';

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  const jobDir = resolve(JOBS_ROOT, jobId);
  const scriptPath = resolve(jobDir, 'script_artifact.json');
  if (!existsSync(scriptPath)) {
    console.error('🛑 SCRIPT_ARTIFACT_MISSING');
    console.error(`  Run: pnpm job:script --job ${jobId} --confirm-openai`);
    return 3;
  }

  let scriptArtifact: Record<string, unknown>;
  try {
    scriptArtifact = JSON.parse(readFileSync(scriptPath, 'utf8'));
  } catch (e) {
    console.error(`🛑 INVALID_SCRIPT_ARTIFACT_JSON: ${(e as Error).message}`);
    return 3;
  }

  const voiceoverText =
    typeof scriptArtifact.voiceoverText === 'string' ? scriptArtifact.voiceoverText.trim() : '';
  if (!voiceoverText) {
    console.error('🛑 VOICEOVER_TEXT_MISSING: script_artifact.json thiếu voiceoverText.');
    return 4;
  }

  const voiceMp3 = resolve(jobDir, 'voiceover.mp3');
  const voiceTiming = resolve(jobDir, 'voice_timing.json');
  const renderPlanPath = resolve(jobDir, 'render_plan.json');
  const voiceMp3Rel = `${JOBS_ROOT}/${jobId}/voiceover.mp3`;

  const voice = voiceChoice === 'female' ? EDGE_FEMALE_VOICE : EDGE_MALE_VOICE;
  const reuse = existsSync(voiceMp3) && existsSync(voiceTiming) && !force;

  console.log('======================================================');
  console.log(`🎬  VFOS Job Manager — render-plan  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Voiceover words:   ${voiceoverText.split(/\s+/).filter(Boolean).length}`);
  console.log(`TTS voice:         ${voice} (${voiceChoice})`);
  console.log(
    `Reuse existing:    ${reuse ? '✅ voiceover.mp3 + voice_timing.json (skip TTS)' : '❌ will synthesize'}`,
  );
  console.log('------------------------------------------------------');

  // ---- 1) obtain word timing (reuse from disk, or synthesize via edge-tts) ----
  let words: EdgeWord[];
  if (reuse) {
    try {
      const parsedTiming = JSON.parse(readFileSync(voiceTiming, 'utf8')) as { words?: EdgeWord[] };
      words = parsedTiming.words ?? [];
    } catch (e) {
      console.error(`🛑 VOICE_TIMING_INVALID: ${(e as Error).message}`);
      return 7;
    }
    if (words.length === 0) {
      console.error(
        '🛑 VOICE_TIMING_INVALID: voice_timing.json không có words — chạy lại với --force.',
      );
      return 7;
    }
  } else {
    if (dryRun) {
      console.log(`🔍 [Dry-Run] Would synthesize edge-tts (${voice}) then build render_plan.json.`);
      console.log('  (cần --confirm-tts để chạy thật)');
      return 0;
    }
    if (!confirmTts) {
      console.error('🛑 MISSING_TTS_CONFIRM');
      console.error('  Sinh giọng đọc là thao tác tạo tài nguyên — chạy lại kèm cờ --confirm-tts.');
      return 5;
    }
    if (!edgePythonExists(process.cwd())) {
      console.error(
        '🛑 EDGE_TTS_UNAVAILABLE: thiếu tools/edge-tts-voice/.venv (setup edge-tts trước).',
      );
      return 6;
    }
    mkdirSync(jobDir, { recursive: true });
    try {
      console.log('Synthesizing voiceover via edge-tts (in-process)...');
      words = synthEdge({ text: voiceoverText, voice, outAudio: voiceMp3, outWords: voiceTiming });
    } catch (e) {
      console.error(`🛑 EDGE_TTS_FAILED: ${(e as Error).message}`);
      return 6;
    }
    console.log(`  ↳ voiceover.mp3 + voice_timing.json written (${words.length} words).`);
  }

  // ---- 2) audio duration (ffprobe on mp3; fallback = last word end) ----
  let durationSec = existsSync(voiceMp3) ? getVideoDuration(voiceMp3) : 0;
  if (!(durationSec > 0)) {
    const last = words[words.length - 1];
    durationSec = last ? last.offsetSec + last.durationSec : 0;
  }

  // ---- 3) chunk + align (PURE @vfos/ai-agents) ----
  const chunks = chunkForSubtitles(voiceoverText);
  let subtitles: SubtitleCue[];
  try {
    subtitles = alignSubtitles(chunks, words);
  } catch (e) {
    console.error(`🛑 SUBTITLE_ALIGN_FAILED: ${(e as Error).message}`);
    console.error('  edge-tts word boundaries lệch số từ với chunker → cần round chuẩn hoá token.');
    return 8;
  }

  // ---- 4) build render_plan + write ----
  const videoSourcePath = manifest.source.sourceVideoPath ?? '';
  const plan = buildRenderPlan(jobId, durationSec, subtitles, videoSourcePath, voiceMp3Rel);

  if (dryRun) {
    console.log(
      `🔍 [Dry-Run] render_plan sẵn sàng: ${subtitles.length} cues, ${durationSec.toFixed(2)}s. Không ghi file.`,
    );
    return 0;
  }

  mkdirSync(dirname(renderPlanPath), { recursive: true });
  writeFileSync(renderPlanPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  // Additive manifest wiring — không đổi state, chỉ trỏ artifact mới.
  const artifacts = manifest.artifacts as Record<string, unknown>;
  artifacts.voiceArtifactPath = artifacts.voiceArtifactPath ?? voiceMp3Rel;
  artifacts.voiceTimingArtifactPath = `${JOBS_ROOT}/${jobId}/voice_timing.json`;
  artifacts.renderPlanPath = `${JOBS_ROOT}/${jobId}/render_plan.json`;
  saveManifest(manifest);

  console.log(
    `✅ render_plan.json written — ${subtitles.length} subtitle cues, duration ${durationSec.toFixed(2)}s.`,
  );
  console.log(`   Preview target:  ${plan.output.path}`);
  console.log('   No publish, no render, no API beyond edge-tts. Ready for FFmpeg/Remotion.');
  console.log(`   Generated at ${isoNow()}`);
  return 0;
}
