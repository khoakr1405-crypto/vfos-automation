#!/usr/bin/env tsx
/**
 * Voice Sync v0 — block-based TTS generation + timeline stitching.
 *
 * Uses the VFOS brand voice (ELEVENLABS_VOICE_ID in .env) + model eleven_v3.
 *
 * Autonomy v0 (2026-05-20):
 *   - Skip SILENT / empty-line blocks automatically (no TTS, no timeline slot).
 *   - Auto-remediate MAJOR_OVERFLOW (>0.5s) by retrying TTS once at +0.1 speed,
 *     capped at 1.4. If still major after retry → exit 2 with actionable report.
 *   - MINOR_OVERFLOW (≤0.5s) is accepted as-is, no retry (matches /chay GUARD 3).
 *
 * Usage:
 *   pnpm voice:sync --script-json <path> --output-dir <dir> [options]
 *
 * Options:
 *   --script-json   Path to script_ai_vX.json (required)
 *   --output-dir    Directory for block audio files + manifest (required)
 *   --voice-id      Raw ElevenLabs voice ID — debug override only.
 *                   When omitted, uses ELEVENLABS_VOICE_ID (brand voice).
 *   --model-id      ElevenLabs model ID (default: eleven_v3)
 *   --speed         TTS speed 0.7–1.3 (default: 1.3)
 *   --max-speed     Upper cap for remediation speed-up (default: 1.4)
 *   --skip-tts      Skip TTS generation, only stitch existing block files
 *   --only-blocks   Comma-separated block IDs to (re)generate; others cached
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { probeAudioDuration } from '../src/duration-probe.js';
import { ElevenLabsClient } from '../src/elevenlabs-client.js';
import { loadDotEnv } from '../src/load-env.js';
import type { VoiceSettings } from '../src/types.js';
import { resolveVoice } from '../src/voice-presets.js';

loadDotEnv();

// Tunable thresholds — Voice Sync Autonomy v0
const MINOR_OVERFLOW_S = 0.5; // ≤0.5s overflow accepted, no retry
const REMEDIATION_SPEED_BUMP = 0.1; // single retry: +0.1 speed
const REMEDIATION_SPEED_DEFAULT_CAP = 1.4; // brand voice stays natural up to 1.4

// ── Args ─────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    'script-json': { type: 'string' },
    'output-dir': { type: 'string' },
    'voice-id': { type: 'string' },
    'model-id': { type: 'string' },
    speed: { type: 'string', default: '1.3' },
    'max-speed': { type: 'string' },
    'skip-tts': { type: 'boolean', default: false },
    'only-blocks': { type: 'string' },
  },
  allowPositionals: false,
  strict: true,
});

if (!values['script-json']) {
  console.error('Error: --script-json required');
  process.exit(1);
}
if (!values['output-dir']) {
  console.error('Error: --output-dir required');
  process.exit(1);
}

const apiKey = process.env['ELEVENLABS_API_KEY'];
const modelId = values['model-id'] ?? process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_v3';
const speed = Number.parseFloat(values.speed!);
const maxSpeed = values['max-speed']
  ? Number.parseFloat(values['max-speed'])
  : REMEDIATION_SPEED_DEFAULT_CAP;
const skipTts = values['skip-tts']!;
const onlyBlocks = values['only-blocks'] ? new Set(values['only-blocks'].split(',')) : null;

if (!skipTts && !apiKey) {
  console.error('Error: ELEVENLABS_API_KEY not set');
  process.exit(1);
}

if (maxSpeed < speed) {
  console.error(`Error: --max-speed ${maxSpeed} must be ≥ --speed ${speed}`);
  process.exit(1);
}

const { voiceId, preset: voicePreset } = skipTts
  ? { voiceId: undefined as string | undefined, preset: null }
  : resolveVoice({ voiceId: values['voice-id'] });

// ── Load script ───────────────────────────────────────────────────────────────

const scriptPath = resolve(values['script-json']!);
const outputDir = resolve(values['output-dir']!);
await mkdir(outputDir, { recursive: true });

const scriptData = JSON.parse(await readFile(scriptPath, 'utf-8'));

type InputBlock = {
  block_id: string;
  intent: string;
  line: string;
  window_start_s: number;
  window_end_s: number;
};

const blocks: InputBlock[] = scriptData.output.blocks;
const videoId = scriptData.input.video_id as string;
const videoTotalDurS = scriptData.input.duration_target_s as number;

console.log('');
console.log('── Voice Sync v0 ───────────────────────────────────────────');
console.log(`  Video      : ${videoId}`);
console.log(`  Blocks     : ${blocks.length}`);
console.log(`  Duration   : ${videoTotalDurS}s`);
if (voicePreset) console.log(`  Preset     : ${voicePreset}`);
console.log(`  Voice ID   : ${voiceId ?? '(skip-tts mode)'}`);
console.log(`  Model      : ${modelId}`);
console.log(`  Speed      : ${speed} (remediation cap: ${maxSpeed})`);
console.log(`  Output dir : ${outputDir}`);
console.log('');

// ── Skip classification (Voice Sync Autonomy v0 — Part A) ────────────────────

type SkipReason = 'silent_intent' | 'empty_line';

function classifySkip(block: InputBlock): SkipReason | null {
  if (block.intent === 'SILENT') return 'silent_intent';
  if (block.line.trim() === '') return 'empty_line';
  return null;
}

// ── TTS per block ─────────────────────────────────────────────────────────────

const client = skipTts
  ? null
  : new ElevenLabsClient({ apiKey: apiKey!, voiceId: voiceId!, modelId });

type FitStatus = 'fit' | 'overflow_minor' | 'overflow_major' | 'underfill' | 'skipped';

type OverflowRemediationOutcome =
  | 'remediated_to_fit'
  | 'remediated_to_minor'
  | 'still_major'
  | 'skipped_at_speed_cap';

type OverflowRemediation = {
  attempted: boolean;
  from_speed: number;
  to_speed: number;
  from_overflow_s: number;
  to_overflow_s: number;
  outcome: OverflowRemediationOutcome;
};

type BlockResult = {
  block_id: string;
  intent: string;
  line: string;
  window_start_s: number;
  window_end_s: number;
  window_duration_s: number;
  audio_file: string | null;
  actual_duration_s: number | null;
  speed_applied: number | null;
  fit_status: FitStatus;
  overflow_s: number;
  buffer_s: number;
  generation_status: 'generated' | 'skipped' | 'missing';
  skip_reason: SkipReason | null;
  overflow_remediation: OverflowRemediation | null;
};

function classifyOverflow(diff: number, windowDur: number, actualDur: number): FitStatus {
  if (diff <= 0) {
    return actualDur >= windowDur * 0.5 ? 'fit' : 'underfill';
  }
  if (diff <= MINOR_OVERFLOW_S) return 'overflow_minor';
  return 'overflow_major';
}

async function generateAndProbe(
  ttsClient: ElevenLabsClient,
  block: InputBlock,
  audioFile: string,
  ttsSpeed: number,
): Promise<{ actual_duration_s: number }> {
  const settings: VoiceSettings = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.4,
    speed: ttsSpeed,
  };
  await ttsClient.generate(block.line, settings, audioFile);
  const probe = await probeAudioDuration(audioFile);
  return { actual_duration_s: probe.duration_s };
}

const results: BlockResult[] = [];

for (const block of blocks) {
  const audioFile = join(outputDir, `${block.block_id}.mp3`);
  const windowDuration = Number.parseFloat((block.window_end_s - block.window_start_s).toFixed(3));

  process.stdout.write(
    `  ${block.block_id.padEnd(4)} [${block.window_start_s}s→${block.window_end_s}s] `,
  );

  // ── A. Skip handling (SILENT / empty line) ─────────────────────────────────
  const skipReason = classifySkip(block);
  if (skipReason) {
    console.log(`SKIP (${skipReason}) — no TTS, no timeline slot`);
    results.push({
      block_id: block.block_id,
      intent: block.intent,
      line: block.line,
      window_start_s: block.window_start_s,
      window_end_s: block.window_end_s,
      window_duration_s: windowDuration,
      audio_file: null,
      actual_duration_s: null,
      speed_applied: null,
      fit_status: 'skipped',
      overflow_s: 0,
      buffer_s: 0,
      generation_status: 'skipped',
      skip_reason: skipReason,
      overflow_remediation: null,
    });
    continue;
  }

  process.stdout.write(`"${block.line.slice(0, 45)}${block.line.length > 45 ? '…' : ''}" `);

  const shouldGenerateTts = !skipTts && (onlyBlocks === null || onlyBlocks.has(block.block_id));

  if (shouldGenerateTts) {
    process.stdout.write('→ TTS… ');
    await client!.generate(
      block.line,
      { stability: 0.5, similarity_boost: 0.75, style: 0.4, speed },
      audioFile,
    );
  } else if (!existsSync(audioFile)) {
    console.log(
      onlyBlocks
        ? 'MISSING (not in --only-blocks, file not found)'
        : 'MISSING (skip-tts but file not found)',
    );
    results.push({
      block_id: block.block_id,
      intent: block.intent,
      line: block.line,
      window_start_s: block.window_start_s,
      window_end_s: block.window_end_s,
      window_duration_s: windowDuration,
      audio_file: audioFile,
      actual_duration_s: null,
      speed_applied: null,
      fit_status: 'underfill',
      overflow_s: 0,
      buffer_s: 0,
      generation_status: 'missing',
      skip_reason: null,
      overflow_remediation: null,
    });
    continue;
  } else if (!skipTts) {
    process.stdout.write('(cached) ');
  }

  const probe = await probeAudioDuration(audioFile);
  let actualDuration = probe.duration_s;
  let diff = actualDuration - windowDuration;
  let fitStatus = classifyOverflow(diff, windowDuration, actualDuration);
  let speedApplied = speed; // cached blocks attribute the run-level speed value
  let remediation: OverflowRemediation | null = null;

  // ── B. MAJOR_OVERFLOW auto-remediation: retry once at higher speed ─────────
  if (fitStatus === 'overflow_major' && !skipTts && shouldGenerateTts && client !== null) {
    const retrySpeed = Math.min(maxSpeed, Number((speed + REMEDIATION_SPEED_BUMP).toFixed(2)));
    if (retrySpeed - speed >= 0.05) {
      console.log(`OVERFLOW_MAJOR ${actualDuration.toFixed(2)}s → retry @ speed ${retrySpeed}`);
      process.stdout.write(`        retry… `);
      const retry = await generateAndProbe(client, block, audioFile, retrySpeed);
      const retryDiff = retry.actual_duration_s - windowDuration;
      const retryStatus = classifyOverflow(retryDiff, windowDuration, retry.actual_duration_s);

      let outcome: OverflowRemediationOutcome;
      if (retryStatus === 'fit') outcome = 'remediated_to_fit';
      else if (retryStatus === 'overflow_minor') outcome = 'remediated_to_minor';
      else outcome = 'still_major';

      remediation = {
        attempted: true,
        from_speed: speed,
        to_speed: retrySpeed,
        from_overflow_s: Number.parseFloat(diff.toFixed(3)),
        to_overflow_s: Number.parseFloat(Math.max(0, retryDiff).toFixed(3)),
        outcome,
      };

      actualDuration = retry.actual_duration_s;
      diff = retryDiff;
      fitStatus = retryStatus;
      speedApplied = retrySpeed;
    } else {
      remediation = {
        attempted: false,
        from_speed: speed,
        to_speed: speed,
        from_overflow_s: Number.parseFloat(diff.toFixed(3)),
        to_overflow_s: Number.parseFloat(diff.toFixed(3)),
        outcome: 'skipped_at_speed_cap',
      };
    }
  }

  console.log(
    `${actualDuration.toFixed(3)}s / ${windowDuration}s → ${fitStatus}` +
      (remediation?.attempted ? ` (after retry @ ${remediation.to_speed})` : ''),
  );

  results.push({
    block_id: block.block_id,
    intent: block.intent,
    line: block.line,
    window_start_s: block.window_start_s,
    window_end_s: block.window_end_s,
    window_duration_s: windowDuration,
    audio_file: audioFile,
    actual_duration_s: Number.parseFloat(actualDuration.toFixed(3)),
    speed_applied: speedApplied,
    fit_status: fitStatus,
    overflow_s: Number.parseFloat(Math.max(0, diff).toFixed(3)),
    buffer_s: Number.parseFloat(Math.max(0, -diff).toFixed(3)),
    generation_status: 'generated',
    skip_reason: null,
    overflow_remediation: remediation,
  });
}

// ── Write manifest ────────────────────────────────────────────────────────────

const manifest = {
  video_id: videoId,
  source_script: scriptPath,
  voice_preset: voicePreset,
  voice_id: voiceId ?? null,
  model_id: modelId,
  speed,
  max_remediation_speed: maxSpeed,
  video_total_duration_s: videoTotalDurS,
  generated_at: new Date().toISOString(),
  blocks: results,
};

const manifestPath = join(outputDir, 'voice_sync_manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log('');
console.log(`  Manifest → ${manifestPath}`);

// ── Stitch timeline (excludes skipped + missing blocks) ──────────────────────

const stitchable = results.filter(
  (r): r is BlockResult & { audio_file: string } =>
    r.generation_status === 'generated' && r.audio_file !== null,
);

console.log('');
console.log(`Stitching voice timeline (${stitchable.length} / ${results.length} blocks)…`);

const timelinePath = join(outputDir, `${videoId}_voice_timeline.mp3`);

const ffmpegArgs: string[] = ['-y'];

for (const r of stitchable) {
  ffmpegArgs.push('-i', r.audio_file);
}

const filterParts: string[] = [];
filterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${videoTotalDurS}[base]`);

for (const [i, r] of stitchable.entries()) {
  const delayMs = Math.round(r.window_start_s * 1000);
  filterParts.push(`[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
}

const mixLabels = stitchable.map((_, i) => `[a${i}]`).join('');
filterParts.push(
  `[base]${mixLabels}amix=inputs=${stitchable.length + 1}:duration=first:dropout_transition=0[out]`,
);

ffmpegArgs.push(
  '-filter_complex',
  filterParts.join(';'),
  '-map',
  '[out]',
  '-t',
  String(videoTotalDurS),
  '-ar',
  '44100',
  timelinePath,
);

const stitch = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf-8' });
if (stitch.status !== 0) {
  console.error('Stitch failed:');
  console.error(stitch.stderr?.slice(-800));
  process.exit(1);
}
console.log(`  Timeline  → ${timelinePath}`);

// ── QC table ─────────────────────────────────────────────────────────────────

console.log('');
console.log('── QC: Block Fit Status ────────────────────────────────────');
console.log('Block | Intent     | Window      | Actual  | Buffer  | Status         | Note');
console.log(
  '------|------------|-------------|---------|---------|----------------|----------------',
);

for (const r of results) {
  const id = r.block_id.padEnd(5);
  const intent = r.intent.padEnd(10);
  const win = `${r.window_start_s}s→${r.window_end_s}s`.padEnd(11);
  const actual = r.actual_duration_s !== null ? `${r.actual_duration_s}s`.padEnd(7) : '—      ';
  const buf =
    r.fit_status === 'fit' || r.fit_status === 'underfill'
      ? `+${r.buffer_s}s`.padEnd(7)
      : r.fit_status === 'skipped'
        ? '—      '
        : `-${r.overflow_s}s`.padEnd(7);
  const status = r.fit_status.padEnd(14);
  let note = '';
  if (r.generation_status === 'skipped') note = r.skip_reason ?? 'skipped';
  else if (r.overflow_remediation?.attempted)
    note = `${r.overflow_remediation.outcome} @ speed ${r.overflow_remediation.to_speed}`;
  else if (r.overflow_remediation?.outcome === 'skipped_at_speed_cap')
    note = 'at speed cap, not retried';
  console.log(`${id} | ${intent} | ${win} | ${actual} | ${buf} | ${status} | ${note}`);
}

const generated = results.filter((r) => r.generation_status === 'generated');
const skipped = results.filter((r) => r.generation_status === 'skipped');
const fits = generated.filter((r) => r.fit_status === 'fit');
const minorOverflows = generated.filter((r) => r.fit_status === 'overflow_minor');
const majorOverflows = generated.filter((r) => r.fit_status === 'overflow_major');
const underfills = generated.filter((r) => r.fit_status === 'underfill');
const remediatedSuccess = generated.filter(
  (r) =>
    r.overflow_remediation?.outcome === 'remediated_to_fit' ||
    r.overflow_remediation?.outcome === 'remediated_to_minor',
);

console.log('');
console.log(
  `  fit: ${fits.length}  overflow_minor: ${minorOverflows.length}  overflow_major: ${majorOverflows.length}  underfill: ${underfills.length}  skipped: ${skipped.length}`,
);
if (remediatedSuccess.length > 0) {
  console.log(
    `  remediated by speed-up: ${remediatedSuccess.length} block(s) — see manifest.overflow_remediation`,
  );
}

if (majorOverflows.length > 0) {
  console.log('');
  console.log('  ⚠ MAJOR_OVERFLOW blocks (pipeline will FAIL):');
  for (const r of majorOverflows) {
    const remed = r.overflow_remediation;
    const tag = remed?.attempted
      ? `retried @ ${remed.to_speed} → still +${r.overflow_s}s over window`
      : remed?.outcome === 'skipped_at_speed_cap'
        ? `already at speed cap (${speed}), retry would not help`
        : `+${r.overflow_s}s over window, no retry attempted`;
    console.log(`    ${r.block_id} (${r.intent}): ${tag} — "${r.line.slice(0, 60)}"`);
  }
  console.log('');
  console.log('  → Operator action: rút text trong script JSON cho block(s) ở trên');
  console.log('    rồi rerun "pnpm voice:sync --only-blocks <id1>,<id2>"');
}

console.log('');
console.log('── Done ────────────────────────────────────────────────────');
console.log(`  Manifest : ${manifestPath}`);
console.log(`  Timeline : ${timelinePath}`);
console.log('');

// Exit code: 0 if everything generated or fit/minor/skipped; 2 if any MAJOR_OVERFLOW remains
if (majorOverflows.length > 0) {
  process.exit(2);
}
