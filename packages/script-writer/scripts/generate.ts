#!/usr/bin/env tsx
/**
 * CLI: generate Vietnamese voiceover script via OpenAI Responses API.
 *
 * Usage:
 *   pnpm script:generate --input <scene_input.json> --output <out.json> [--text-output <out.txt>]
 *
 * Options:
 *   --input        Path to ScriptWriterInput JSON (required)
 *   --output       Path to write full ScriptOutput JSON (required)
 *   --text-output  Optional path to also write just the paste-into-TTS plain text
 *   --model        OpenAI model id (overrides OPENAI_MODEL env, default: gpt-4o-mini)
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../src/load-env.js';
import { ScriptWriterClient } from '../src/openai-client.js';
import type { GenerateResult } from '../src/types.js';
import { ScriptWriterInputSchema } from '../src/types.js';

loadDotEnv();

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    'text-output': { type: 'string' },
    model: { type: 'string' },
  },
  allowPositionals: false,
  strict: true,
});

if (!values.input) {
  console.error('Error: --input <scene_input.json> is required');
  process.exit(1);
}
if (!values.output) {
  console.error('Error: --output <out.json> is required');
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Error: OPENAI_API_KEY env var is not set');
  console.error('  Get one at: https://platform.openai.com/api-keys');
  process.exit(1);
}

const model = values.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const inputPath = resolve(values.input);
if (!existsSync(inputPath)) {
  console.error(`Error: Input file not found: ${inputPath}`);
  process.exit(1);
}

const raw = await readFile(inputPath, 'utf8');
let parsedJson: unknown;
try {
  parsedJson = JSON.parse(raw);
} catch (err) {
  console.error(`Error: Input file is not valid JSON: ${inputPath}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const parseResult = ScriptWriterInputSchema.safeParse(parsedJson);
if (!parseResult.success) {
  console.error('Error: Input file does not match ScriptWriterInput schema:');
  for (const issue of parseResult.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
const input = parseResult.data;

const outputPath = resolve(values.output);
const textOutputPath = values['text-output'] ? resolve(values['text-output']) : null;
await mkdir(dirname(outputPath), { recursive: true });
if (textOutputPath) await mkdir(dirname(textOutputPath), { recursive: true });

console.log('');
console.log('── OpenAI Script Writer ────────────────────────────────────');
console.log(`  Video       : ${input.video_id}`);
console.log(`  Platform    : ${input.target_platform}`);
console.log(`  Duration    : ${input.duration_target_s}s`);
console.log(`  Scenes      : ${input.scene_timeline.length}`);
console.log(`  Model       : ${model}`);
console.log(`  Output JSON : ${outputPath}`);
if (textOutputPath) console.log(`  Output TXT  : ${textOutputPath}`);
console.log('');

const client = new ScriptWriterClient({ apiKey, model });

process.stdout.write('Generating… ');
const t0 = Date.now();
let result: GenerateResult;
try {
  result = await client.generate(input);
} catch (err) {
  console.error('');
  console.error('Error: OpenAI generation failed');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`done (${elapsed}s)`);

const { output, meta } = result;

const fullJson = {
  input,
  output,
  meta,
  generated_at: new Date().toISOString(),
};
await writeFile(outputPath, JSON.stringify(fullJson, null, 2), 'utf8');

if (textOutputPath) {
  await writeFile(textOutputPath, `${output.full_script.trim()}\n`, 'utf8');
}

const wordCount = output.full_script.trim().split(/\s+/).filter(Boolean).length;
const estDurationS = wordCount / 2.8;

console.log('');
console.log('── Result ──────────────────────────────────────────────────');
console.log(`  Hook        : ${output.hook}`);
console.log(`  CTA         : ${output.cta}`);
console.log(`  Blocks      : ${output.blocks.length}`);
console.log(`  Words       : ${wordCount}`);
console.log(`  Est. TTS    : ${estDurationS.toFixed(1)}s @ 170 WPM`);
console.log(`  Input tok   : ${meta.input_tokens ?? 'n/a'}`);
console.log(`  Output tok  : ${meta.output_tokens ?? 'n/a'}`);
console.log(`  Response ID : ${meta.response_id}`);
console.log('');
if (output.writer_notes.length > 0) {
  console.log('Writer notes:');
  for (const note of output.writer_notes) console.log(`  - ${note}`);
  console.log('');
}
console.log(`Files: ${outputPath}`);
if (textOutputPath) console.log(`       ${textOutputPath}`);
console.log('');
