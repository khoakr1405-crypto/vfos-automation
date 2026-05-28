/**
 * Offline Voice Generator Helper Script — Round P13.
 *
 * Simulates generating voice assets by producing voice_artifact.json placeholder metadata.
 * Supports simulating pass vs voice-fail modes.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

// Parse command-line parameters
let values: any;
try {
  const parsed = parseArgs({
    options: {
      script: { type: 'string' },
      output: { type: 'string' },
      mode: { type: 'string', default: 'pass' },
    },
    allowPositionals: false,
    strict: true,
  });
  values = parsed.values;
} catch (err: any) {
  console.error(`ERROR: Failed to parse arguments: ${err.message}`);
  process.exit(1);
}

if (!values.script || !values.output) {
  console.error('ERROR: Mandatory options "--script <path>" and "--output <path>" are required.');
  process.exit(1);
}

const scriptPath = values.script;
const outputPath = values.output;
const mode = values.mode;

console.log(`[OfflineVoiceGen] Mode: ${mode}`);
console.log(`[OfflineVoiceGen] Output Path: ${outputPath}`);

// 1. Handle explicit voice-fail mode
if (mode === 'voice-fail') {
  console.error('ERROR: Simulated voice generation blocking failure triggered.');
  process.exit(1);
}

// 2. Read and validate script artifact
if (!existsSync(scriptPath)) {
  console.error(`ERROR: Source script artifact not found at: ${scriptPath}`);
  process.exit(1);
}

let scriptContent = '';
let originalPayload: any;
try {
  const raw = readFileSync(scriptPath, 'utf8').trim();
  originalPayload = JSON.parse(raw);
  scriptContent = originalPayload.script || '';
} catch (err: any) {
  console.error(`ERROR: Failed to parse script artifact JSON: ${err.message}`);
  process.exit(1);
}

if (!scriptContent) {
  console.error('ERROR: Script content is empty or missing in script artifact.');
  process.exit(1);
}

// 3. Estimate duration and timing blocks
// Clean text for word counting
const words = scriptContent.split(/\s+/).filter(Boolean);
const wordCount = words.length;
const wordsPerMinute = 150;
const estimatedDurationSec = Math.round(((wordCount / wordsPerMinute) * 60) * 10) / 10;

// Split into crude sentence blocks for timing simulation
const sentences = scriptContent.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
const timingBlocks: any[] = [];
let accumulatedTime = 0.0;

sentences.forEach((text, index) => {
  const sentenceWords = text.split(/\s+/).filter(Boolean).length;
  const sentenceDuration = Math.round(((sentenceWords / wordsPerMinute) * 60) * 10) / 10;
  const endSec = Math.round((accumulatedTime + sentenceDuration) * 10) / 10;

  timingBlocks.push({
    index: index + 1,
    text: `${text}.`,
    startSec: accumulatedTime,
    endSec,
    wordCount: sentenceWords,
  });

  accumulatedTime = endSec;
});

const payload = {
  voiceId: 'vfos_offline_speaker_01',
  sourceScriptPath: scriptPath,
  estimatedDurationSec: accumulatedTime || estimatedDurationSec,
  wordCount,
  estimatedWordsPerMinute: wordsPerMinute,
  timingBlocks,
  offlineMode: mode,
  generatedAt: new Date().toISOString(),
};

try {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[OfflineVoiceGen] Voice placeholder artifact written successfully.');
  process.exit(0);
} catch (err: any) {
  console.error(`ERROR: Failed to write voice artifact: ${err.message}`);
  process.exit(1);
}
