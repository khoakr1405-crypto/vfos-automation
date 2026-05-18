#!/usr/bin/env tsx
/**
 * Voice Sync v0 — block-based TTS generation + timeline stitching.
 *
 * Usage:
 *   pnpm voice:sync --script-json <path> --output-dir <dir> [options]
 *
 * Options:
 *   --script-json   Path to script_ai_vX.json (required)
 *   --output-dir    Directory for block audio files + manifest (required)
 *   --voice-preset  Named preset: default, voice_01…voice_05 (see voice-presets.ts)
 *   --voice-id      Raw ElevenLabs voice ID — direct override, use --voice-preset instead
 *   --model-id      ElevenLabs model ID (default: eleven_v3)
 *   --speed         TTS speed 0.7–1.3 (default: 1.3)
 *   --skip-tts      Skip TTS generation, only stitch existing block files
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDotEnv } from '../src/load-env.js';
import { ElevenLabsClient } from '../src/elevenlabs-client.js';
import { probeAudioDuration } from '../src/duration-probe.js';
import { resolveVoice } from '../src/voice-presets.js';
import type { VoiceSettings } from '../src/types.js';

loadDotEnv();

// ── Args ─────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    'script-json':   { type: 'string' },
    'output-dir':    { type: 'string' },
    'voice-preset':  { type: 'string' },
    'voice-id':      { type: 'string' },
    'model-id':      { type: 'string' },
    speed:           { type: 'string', default: '1.3' },
    'skip-tts':      { type: 'boolean', default: false },
    'only-blocks':   { type: 'string' },  // comma-separated block IDs to (re)generate; others use cached file
  },
  allowPositionals: false,
  strict: true,
});

if (!values['script-json']) { console.error('Error: --script-json required'); process.exit(1); }
if (!values['output-dir'])  { console.error('Error: --output-dir required');  process.exit(1); }

const apiKey     = process.env['ELEVENLABS_API_KEY'];
const modelId    = values['model-id'] ?? process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_v3';
const speed      = parseFloat(values.speed!);
const skipTts    = values['skip-tts']!;
const onlyBlocks = values['only-blocks'] ? new Set(values['only-blocks'].split(',')) : null;

if (!skipTts && !apiKey) { console.error('Error: ELEVENLABS_API_KEY not set'); process.exit(1); }

// Resolve voice ID via preset library (no-op in skip-tts mode)
const { voiceId, preset: voicePreset } = skipTts
  ? { voiceId: undefined as string | undefined, preset: null }
  : resolveVoice({ voiceId: values['voice-id'], voicePreset: values['voice-preset'] });

// ── Load script ───────────────────────────────────────────────────────────────

const scriptPath = resolve(values['script-json']!);
const outputDir  = resolve(values['output-dir']!);
await mkdir(outputDir, { recursive: true });

const scriptData = JSON.parse(await readFile(scriptPath, 'utf-8'));
const blocks: Array<{
  block_id: string;
  intent: string;
  line: string;
  window_start_s: number;
  window_end_s: number;
}> = scriptData.output.blocks;

const videoId          = scriptData.input.video_id as string;
const videoTotalDurS   = scriptData.input.duration_target_s as number;
const settings: VoiceSettings = { stability: 0.5, similarity_boost: 0.75, style: 0.4, speed };

console.log('');
console.log('── Voice Sync v0 ───────────────────────────────────────────');
console.log(`  Video      : ${videoId}`);
console.log(`  Blocks     : ${blocks.length}`);
console.log(`  Duration   : ${videoTotalDurS}s`);
if (voicePreset) console.log(`  Preset     : ${voicePreset}`);
console.log(`  Voice ID   : ${voiceId ?? '(skip-tts mode)'}`);
console.log(`  Model      : ${modelId}`);
console.log(`  Speed      : ${speed}`);
console.log(`  Output dir : ${outputDir}`);
console.log('');

// ── TTS per block ─────────────────────────────────────────────────────────────

const client = skipTts ? null : new ElevenLabsClient({ apiKey: apiKey!, voiceId: voiceId!, modelId });

type BlockResult = {
  block_id: string;
  intent: string;
  line: string;
  window_start_s: number;
  window_end_s: number;
  window_duration_s: number;
  audio_file: string;
  actual_duration_s: number;
  fit_status: 'fit' | 'overflow_minor' | 'overflow' | 'underfill';
  overflow_s: number;
  buffer_s: number;
};

const results: BlockResult[] = [];

for (const block of blocks) {
  const audioFile      = join(outputDir, `${block.block_id}.mp3`);
  const windowDuration = parseFloat((block.window_end_s - block.window_start_s).toFixed(3));

  process.stdout.write(`  ${block.block_id.padEnd(4)} [${block.window_start_s}s→${block.window_end_s}s] `);
  process.stdout.write(`"${block.line.slice(0, 45)}${block.line.length > 45 ? '…' : ''}" `);

  const shouldGenerateTts = !skipTts && (onlyBlocks === null || onlyBlocks.has(block.block_id));

  if (shouldGenerateTts) {
    process.stdout.write('→ TTS… ');
    await client!.generate(block.line, settings, audioFile);
  } else if (!existsSync(audioFile)) {
    console.log(onlyBlocks ? 'MISSING (not in --only-blocks, file not found)' : 'MISSING (skip-tts but file not found)');
    continue;
  } else if (!shouldGenerateTts && !skipTts) {
    process.stdout.write('(cached) ');
  }

  const probe          = await probeAudioDuration(audioFile);
  const actualDuration = probe.duration_s;
  const diff           = actualDuration - windowDuration;

  let fitStatus: BlockResult['fit_status'];
  if (actualDuration <= windowDuration) {
    fitStatus = actualDuration >= windowDuration * 0.5 ? 'fit' : 'underfill';
  } else if (diff <= 0.5) {
    fitStatus = 'overflow_minor';
  } else {
    fitStatus = 'overflow';
  }

  console.log(`${actualDuration.toFixed(3)}s / ${windowDuration}s → ${fitStatus}`);

  results.push({
    block_id:          block.block_id,
    intent:            block.intent,
    line:              block.line,
    window_start_s:    block.window_start_s,
    window_end_s:      block.window_end_s,
    window_duration_s: windowDuration,
    audio_file:        audioFile,
    actual_duration_s: parseFloat(actualDuration.toFixed(3)),
    fit_status:        fitStatus,
    overflow_s:        parseFloat(Math.max(0, diff).toFixed(3)),
    buffer_s:          parseFloat(Math.max(0, -diff).toFixed(3)),
  });
}

// ── Write manifest ────────────────────────────────────────────────────────────

const manifest = {
  video_id:             videoId,
  source_script:        scriptPath,
  voice_preset:         voicePreset,
  voice_id:             voiceId ?? null,
  model_id:             modelId,
  speed,
  video_total_duration_s: videoTotalDurS,
  generated_at:         new Date().toISOString(),
  blocks:               results,
};

const manifestPath = join(outputDir, 'voice_sync_manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log('');
console.log(`  Manifest → ${manifestPath}`);

// ── Stitch timeline ───────────────────────────────────────────────────────────

console.log('');
console.log('Stitching voice timeline…');

const timelinePath = join(outputDir, `${videoId}_voice_timeline.mp3`);

// Build ffmpeg args as array to avoid shell-escaping issues on Windows
const ffmpegArgs: string[] = ['-y'];

for (const r of results) {
  ffmpegArgs.push('-i', r.audio_file);
}

// Build filter_complex
const filterParts: string[] = [];
filterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${videoTotalDurS}[base]`);

for (let i = 0; i < results.length; i++) {
  const delayMs = Math.round(results[i].window_start_s * 1000);
  filterParts.push(`[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
}

const mixLabels = results.map((_, i) => `[a${i}]`).join('');
filterParts.push(
  `[base]${mixLabels}amix=inputs=${results.length + 1}:duration=first:dropout_transition=0[out]`
);

ffmpegArgs.push(
  '-filter_complex', filterParts.join(';'),
  '-map', '[out]',
  '-t', String(videoTotalDurS),
  '-ar', '44100',
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
console.log('Block | Intent     | Window      | Actual  | Buffer  | Status');
console.log('------|------------|-------------|---------|---------|--------');

for (const r of results) {
  const id     = r.block_id.padEnd(5);
  const intent = r.intent.padEnd(10);
  const win    = `${r.window_start_s}s→${r.window_end_s}s`.padEnd(11);
  const actual = `${r.actual_duration_s}s`.padEnd(7);
  const buf    = r.fit_status === 'fit' || r.fit_status === 'underfill'
    ? `+${r.buffer_s}s`.padEnd(7)
    : `-${r.overflow_s}s`.padEnd(7);
  console.log(`${id} | ${intent} | ${win} | ${actual} | ${buf} | ${r.fit_status}`);
}

const overflows = results.filter(r => r.fit_status === 'overflow' || r.fit_status === 'overflow_minor');
const fits      = results.filter(r => r.fit_status === 'fit');
const underfill = results.filter(r => r.fit_status === 'underfill');

console.log('');
console.log(`  fit: ${fits.length}  overflow: ${overflows.filter(r=>r.fit_status==='overflow').length}  overflow_minor: ${overflows.filter(r=>r.fit_status==='overflow_minor').length}  underfill: ${underfill.length}`);

if (overflows.length > 0) {
  console.log('');
  console.log('  ⚠ Overflow blocks (may bleed into next window):');
  for (const r of overflows) {
    console.log(`    ${r.block_id}: +${r.overflow_s}s over window — "${r.line.slice(0, 60)}"`);
  }
}

console.log('');
console.log('── Done ────────────────────────────────────────────────────');
console.log(`  Manifest : ${manifestPath}`);
console.log(`  Timeline : ${timelinePath}`);
console.log('');
