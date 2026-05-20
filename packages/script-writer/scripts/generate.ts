#!/usr/bin/env tsx
/**
 * CLI: generate Vietnamese voiceover script via OpenAI Responses API.
 *
 * Usage:
 *   pnpm script:generate --input <scene_input.json> --output <out.json> [--text-output <out.txt>]
 *                        [--extender-output <ext.json>] [--extender-text-output <ext.txt>]
 *                        [--model gpt-4o]
 *
 * Options:
 *   --input                  Path to ScriptWriterInput JSON (required)
 *   --output                 Path to write full ScriptOutput JSON for pass-1 base (required)
 *   --text-output            Optional path to also write just the paste-into-TTS plain text (pass 1)
 *   --extender-output        Optional path to write extended ScriptOutput JSON. When set and pass 1
 *                            underwrites cleanly (prose passes, only word_count fails low), an
 *                            Extender Pass is run and final result is written here.
 *   --extender-text-output   Optional matching .txt for the extended script.
 *   --model                  OpenAI model id (overrides OPENAI_MODEL env, default: gpt-4o-mini)
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../src/load-env.js';
import { ScriptWriterClient } from '../src/openai-client.js';
import {
  type QualityReport,
  type QualityStatus,
  buildQualityReport,
  computeWordBudget,
} from '../src/quality-guard.js';
import type { GenerateResult, ScriptOutput } from '../src/types.js';
import { ScriptWriterInputSchema } from '../src/types.js';

loadDotEnv();

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    'text-output': { type: 'string' },
    'extender-output': { type: 'string' },
    'extender-text-output': { type: 'string' },
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
const extenderOutputPath = values['extender-output'] ? resolve(values['extender-output']) : null;
const extenderTextOutputPath = values['extender-text-output']
  ? resolve(values['extender-text-output'])
  : null;
const extenderEnabled = extenderOutputPath !== null;

await mkdir(dirname(outputPath), { recursive: true });
if (textOutputPath) await mkdir(dirname(textOutputPath), { recursive: true });
if (extenderOutputPath) await mkdir(dirname(extenderOutputPath), { recursive: true });
if (extenderTextOutputPath) await mkdir(dirname(extenderTextOutputPath), { recursive: true });

console.log('');
console.log('── OpenAI Script Writer ────────────────────────────────────');
console.log(`  Video       : ${input.video_id}`);
console.log(`  Platform    : ${input.target_platform}`);
console.log(`  Duration    : ${input.duration_target_s}s`);
console.log(`  Scenes      : ${input.scene_timeline.length}`);
console.log(`  Model       : ${model}`);
console.log(`  Extender    : ${extenderEnabled ? 'enabled' : 'disabled'}`);
console.log(`  Output JSON : ${outputPath}`);
if (textOutputPath) console.log(`  Output TXT  : ${textOutputPath}`);
if (extenderOutputPath) console.log(`  Extender out: ${extenderOutputPath}`);
console.log('');

const client = new ScriptWriterClient({ apiKey, model });

process.stdout.write('Generating pass 1… ');
const t0 = Date.now();
let pass1: GenerateResult;
try {
  pass1 = await client.generate(input);
} catch (err) {
  console.error('');
  console.error('Error: OpenAI generation failed');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
const pass1Elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`done (${pass1Elapsed}s)`);

const pass1Quality = buildQualityReport(pass1.output, input.duration_target_s);

await writeOutput(outputPath, textOutputPath, input, pass1, pass1Quality);
printResult('Pass 1', pass1.output, pass1.meta, pass1Quality);

// Extender only runs when pass 1 is a true `fail` (under target). Near-pass
// is already acceptable, so we skip the extra API call to avoid risking a
// regression on hook/CTA preservation just to nudge the count.
const shouldExtend =
  extenderEnabled &&
  pass1Quality.quality_status === 'fail' &&
  pass1Quality.hook_consistent &&
  pass1Quality.cta_consistent &&
  pass1Quality.banned_phrases_found.filter((h) => h.hard).length === 0 &&
  !pass1Quality.word_count_within_target &&
  pass1Quality.word_count < pass1Quality.word_count_target;

if (!extenderEnabled) {
  console.log('Extender: not requested. Done.');
  console.log('');
  console.log(`Files: ${outputPath}`);
  if (textOutputPath) console.log(`       ${textOutputPath}`);
  console.log('');
  process.exit(0);
}

if (!shouldExtend) {
  console.log('');
  console.log('── Extender ────────────────────────────────────────────────');
  if (pass1Quality.passed) {
    console.log('  Skipped: pass 1 already PASSED quality guard.');
  } else if (pass1Quality.quality_status === 'near_pass') {
    console.log('  Skipped: pass 1 already NEAR-PASS (no extender needed).');
  } else if (!pass1Quality.hook_consistent || !pass1Quality.cta_consistent) {
    console.log('  Skipped: hook/CTA inconsistency — extender only fixes length, not structure.');
  } else if (pass1Quality.banned_phrases_found.some((h) => h.hard)) {
    console.log('  Skipped: hard-banned phrase in pass 1 — fix prose root cause first.');
  } else if (pass1Quality.word_count > pass1Quality.word_count_target) {
    console.log('  Skipped: pass 1 over-target, not under. Extender only expands.');
  }
  console.log('');
  console.log(`Files: ${outputPath}`);
  if (textOutputPath) console.log(`       ${textOutputPath}`);
  console.log('');
  process.exit(exitCodeFor(pass1Quality.quality_status));
}

const {
  target: targetWords,
  min: minWords,
  max: maxWords,
} = computeWordBudget(input.duration_target_s);

process.stdout.write('Running Extender Pass… ');
const t1 = Date.now();
let pass2: GenerateResult;
try {
  pass2 = await client.expand({
    original: pass1.output,
    scene_timeline: input.scene_timeline,
    current_word_count: pass1Quality.word_count,
    target_words: targetWords,
    min_words: minWords,
    max_words: maxWords,
    content_goal: input.content_goal,
    affiliate_angle: input.affiliate_angle,
  });
} catch (err) {
  console.error('');
  console.error('Error: Extender Pass failed');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
const pass2Elapsed = ((Date.now() - t1) / 1000).toFixed(1);
console.log(`done (${pass2Elapsed}s)`);

const pass2Quality = buildQualityReport(pass2.output, input.duration_target_s, {
  pass1_cta: pass1.output.cta,
});

if (extenderOutputPath) {
  await writeOutput(extenderOutputPath, extenderTextOutputPath, input, pass2, pass2Quality, {
    pass1_word_count: pass1Quality.word_count,
    pass1_response_id: pass1.meta.response_id,
    pass2_response_id: pass2.meta.response_id,
  });
}

printResult('Extended', pass2.output, pass2.meta, pass2Quality);

console.log('');
console.log('Files:');
console.log(`  pass 1 JSON : ${outputPath}`);
if (textOutputPath) console.log(`  pass 1 TXT  : ${textOutputPath}`);
if (extenderOutputPath) console.log(`  extended JSON: ${extenderOutputPath}`);
if (extenderTextOutputPath) console.log(`  extended TXT : ${extenderTextOutputPath}`);
console.log('');

process.exit(exitCodeFor(pass2Quality.quality_status));

/**
 * Exit-code contract — orchestration consumes this:
 *   0  pass or near_pass — pipeline continues
 *   2  fail — pipeline must stop or retry
 * Other non-zero codes earlier in the script signal config/IO errors
 * (missing input, OpenAI failure), not quality failures.
 */
function exitCodeFor(status: QualityStatus): number {
  return status === 'fail' ? 2 : 0;
}

async function writeOutput(
  jsonPath: string,
  txtPath: string | null,
  input: unknown,
  result: GenerateResult,
  quality: QualityReport,
  extenderMeta?: {
    pass1_word_count: number;
    pass1_response_id: string;
    pass2_response_id: string;
  },
) {
  const fullJson = {
    input,
    output: result.output,
    meta: result.meta,
    quality_report: quality,
    ...(extenderMeta ? { extender_meta: extenderMeta } : {}),
    generated_at: new Date().toISOString(),
  };
  await writeFile(jsonPath, JSON.stringify(fullJson, null, 2), 'utf8');
  if (txtPath) await writeFile(txtPath, `${result.output.full_script.trim()}\n`, 'utf8');
}

function printResult(
  label: string,
  output: ScriptOutput,
  meta: GenerateResult['meta'],
  quality: QualityReport,
) {
  const estDurationS = quality.word_count / 2.8;
  console.log('');
  console.log(`── Result (${label}) ─────────────────────────────────────`);
  console.log(`  Hook        : ${output.hook}`);
  console.log(`  CTA         : ${output.cta}`);
  console.log(`  Blocks      : ${output.blocks.length}`);
  console.log(`  Words       : ${quality.word_count} (target ${quality.word_count_target})`);
  console.log(`  Est. TTS    : ${estDurationS.toFixed(1)}s @ 170 WPM`);
  console.log(`  Input tok   : ${meta.input_tokens ?? 'n/a'}`);
  console.log(`  Output tok  : ${meta.output_tokens ?? 'n/a'}`);
  console.log(`  Response ID : ${meta.response_id}`);
  console.log('');
  console.log(`── Quality (${label}) ────────────────────────────────────`);
  const statusLabel =
    quality.quality_status === 'pass'
      ? 'PASS'
      : quality.quality_status === 'near_pass'
        ? 'NEAR-PASS'
        : 'FAIL';
  console.log(`  Status         : ${statusLabel}`);
  if (quality.near_pass_reason) {
    console.log(`  Near-pass why  : ${quality.near_pass_reason}`);
  }
  console.log(`  Hook consistent: ${quality.hook_consistent ? 'yes' : 'NO'}`);
  console.log(`  CTA consistent : ${quality.cta_consistent ? 'yes' : 'NO'}`);
  if (quality.cta_preserved !== null) {
    console.log(`  CTA preserved  : ${quality.cta_preserved ? 'yes' : 'NO (rewrite/leak)'}`);
  }
  console.log(`  Word in target : ${quality.word_count_within_target ? 'yes' : 'NO'}`);
  if (quality.warnings.length > 0) {
    console.log('  Warnings:');
    for (const w of quality.warnings) console.log(`    - ${w}`);
  } else {
    console.log('  Warnings       : (none)');
  }
  if (output.writer_notes.length > 0) {
    console.log('  Writer notes:');
    for (const note of output.writer_notes) console.log(`    - ${note}`);
  }
}
