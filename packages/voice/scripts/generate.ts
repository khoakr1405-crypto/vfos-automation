#!/usr/bin/env tsx
/**
 * CLI: generate Vietnamese voiceover via ElevenLabs TTS API.
 *
 * Usage:
 *   pnpm voice:generate --input <script.txt> --output <out.mp3> [options]
 *
 * Options:
 *   --input         Path to plain-text script file (required)
 *   --output        Output MP3 path (required)
 *   --voice-preset  Named preset: default, voice_01…voice_05 (see voice-presets.ts)
 *   --voice-id      Raw ElevenLabs voice ID — direct override, use --voice-preset instead
 *   --model-id      ElevenLabs model ID (overrides ELEVENLABS_MODEL_ID env, default: eleven_v3)
 *                   Vietnamese-compatible: eleven_v3, eleven_flash_v2_5
 *                   DO NOT use eleven_multilingual_v2 — no Vietnamese support
 *   --stability     0.0–1.0, default 0.50
 *   --similarity    0.0–1.0, default 0.75
 *   --style         0.0–1.0, default 0.40
 *   --speed         0.7–1.3, default 1.0
 */

import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadDotEnv } from '../src/load-env.js';
import { ElevenLabsClient } from '../src/elevenlabs-client.js';
import { probeAudioDuration } from '../src/duration-probe.js';
import { resolveVoice } from '../src/voice-presets.js';
import type { VoiceSettings } from '../src/types.js';

loadDotEnv();

// ── Arg parsing ──────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    input:           { type: 'string' },
    output:          { type: 'string' },
    'voice-preset':  { type: 'string' },
    'voice-id':      { type: 'string' },
    'model-id':      { type: 'string' },
    stability:       { type: 'string', default: '0.50' },
    similarity:      { type: 'string', default: '0.75' },
    style:           { type: 'string', default: '0.40' },
    speed:           { type: 'string', default: '1.0' },
  },
  allowPositionals: false,
  strict: true,
});

// ── Validation ───────────────────────────────────────────────────────────────

if (!values.input) {
  console.error('Error: --input <script-file> is required');
  process.exit(1);
}
if (!values.output) {
  console.error('Error: --output <mp3-path> is required');
  process.exit(1);
}

const apiKey = process.env['ELEVENLABS_API_KEY'];
if (!apiKey) {
  console.error('Error: ELEVENLABS_API_KEY env var is not set');
  console.error('  Get your key at: https://elevenlabs.io → Profile → API Keys');
  process.exit(1);
}

const { voiceId, preset: voicePreset } = resolveVoice({
  voiceId: values['voice-id'],
  voicePreset: values['voice-preset'],
});

const modelId = values['model-id'] ?? process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_v3';

const inputPath = resolve(values.input);
if (!existsSync(inputPath)) {
  console.error(`Error: Input file not found: ${inputPath}`);
  process.exit(1);
}

// ── Read script ──────────────────────────────────────────────────────────────

const scriptText = (await readFile(inputPath, 'utf-8')).trim();
if (!scriptText) {
  console.error(`Error: Input file is empty: ${inputPath}`);
  process.exit(1);
}

const wordCount = scriptText.split(/\s+/).filter(Boolean).length;

// ── Settings ─────────────────────────────────────────────────────────────────

const settings: VoiceSettings = {
  stability:        parseFloat(values.stability!),
  similarity_boost: parseFloat(values.similarity!),
  style:            parseFloat(values.style!),
  speed:            parseFloat(values.speed!),
};

const outputPath = resolve(values.output);
await mkdir(dirname(outputPath), { recursive: true });

// ── Generate ─────────────────────────────────────────────────────────────────

console.log('');
console.log('── ElevenLabs TTS ──────────────────────────────────────────');
if (voicePreset) console.log(`  Preset     : ${voicePreset}`);
console.log(`  Voice ID   : ${voiceId}`);
console.log(`  Model      : ${modelId}`);
console.log(`  Stability  : ${settings.stability}`);
console.log(`  Similarity : ${settings.similarity_boost}`);
console.log(`  Style      : ${settings.style}`);
console.log(`  Speed      : ${settings.speed}`);
console.log(`  Words      : ${wordCount}`);
console.log(`  Script     : ${scriptText.slice(0, 100)}${scriptText.length > 100 ? '…' : ''}`);
console.log(`  Output     : ${outputPath}`);
console.log('');

const client = new ElevenLabsClient({ apiKey, voiceId, modelId });

try {
  process.stdout.write('Generating… ');
  const result = await client.generate(scriptText, settings, outputPath);
  console.log('done');
  console.log(`  Chars used : ${result.character_count}`);
} catch (err) {
  console.error('');
  console.error(`Error: TTS generation failed`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// ── Probe duration ────────────────────────────────────────────────────────────

try {
  process.stdout.write('Probing duration… ');
  const probe = await probeAudioDuration(outputPath);
  console.log('done');
  console.log('');
  console.log('── Result ──────────────────────────────────────────────────');
  console.log(`  Duration   : ${probe.duration_s.toFixed(3)}s`);
  console.log(`  Format     : ${probe.format}`);
  console.log(`  Bitrate    : ${Math.round(probe.bitrate_bps / 1000)} kb/s`);
  console.log(`  Est. WPM   : ${Math.round(wordCount / (probe.duration_s / 60))}`);
  console.log(`  File       : ${outputPath}`);
  console.log('');
} catch (err) {
  console.warn('');
  console.warn(
    'Warning: Could not probe duration (ffprobe not found or FFPROBE_PATH not set)',
  );
  console.warn('  Audio was saved. Set FFPROBE_PATH to enable duration checking.');
  console.warn(err instanceof Error ? err.message : String(err));
}
