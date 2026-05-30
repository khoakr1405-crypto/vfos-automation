#!/usr/bin/env tsx

/**
 * VFOS Kinetic Caption Renderer v1 — Round 34A.
 *
 * Đọc voice_timing_artifact.json (character-level alignment từ Round 33),
 * group chars → words → caption chunks (3–5 từ, ≤2.2s, ≤28 chars), phân
 * loại HOOK/BODY/CTA, generate ASS subtitle với active-word highlight,
 * burn vào video bằng FFmpeg.
 *
 * Outputs trong data/temp/pipeline-p9-demo/<runId>/:
 *   - kinetic_caption_plan.json   (plan + chunks + words timing)
 *   - kinetic_captions.ass        (ASS subtitle file, UTF-8 BOM)
 *   - preview_with_captions.mp4   (final captioned video)
 *
 * Safety:
 *   - KHÔNG gọi API (ElevenLabs/OpenAI/Shopee/Facebook).
 *   - KHÔNG đọc .env. KHÔNG log token/cookie/session.
 *   - Output là runtime, đã gitignore (data/temp + production mp4 patterns).
 *   - Nếu preview là placeholder/testsrc, vẫn render được nhưng ghi
 *     warning INPUT_VIDEO_MAY_BE_PLACEHOLDER_DO_NOT_APPROVE.
 *
 * Usage:
 *   pnpm caption:kinetic --run run_review_product_p9 [--dry-run]
 *   pnpm caption:kinetic --run <id> --input <video> --output <out.mp4>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

interface TimingAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

interface TimingArtifact {
  timingVersion: string;
  runId: string;
  alignment: TimingAlignment;
  normalizedAlignment?: TimingAlignment;
  captionReady?: boolean;
}

interface Word {
  text: string;
  startSec: number;
  endSec: number;
}

type ChunkIntent = 'HOOK' | 'BODY' | 'CTA';

interface Chunk {
  index: number;
  intent: ChunkIntent;
  text: string;
  startSec: number;
  endSec: number;
  words: Word[];
}

const HOOK_KEYWORDS = ['ê', 'khoan', 'đừng lướt', 'lướt qua', 'siêu phẩm', 'hot'];
const CTA_KEYWORDS = [
  'link',
  'bên dưới',
  'giỏ hàng',
  'mua',
  'đặt',
  'săn',
  'chốt',
  'bấm',
  'click',
];

const MAX_WORDS_PER_CHUNK = 5;
const MAX_CHARS_PER_CHUNK = 28;
const MAX_CHUNK_DURATION_SEC = 2.2;
const HOOK_TIME_THRESHOLD_SEC = 2.5;

function formatAssTime(sec: number): string {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec - Math.floor(sec)) * 100);
  const csClamped = cs >= 100 ? 99 : cs;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(csClamped).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

// Group character-level alignment into words by whitespace. A "word" includes
// trailing punctuation (",", ".", "!", "?") so chunks can break on them cleanly.
function groupWords(align: TimingAlignment): Word[] {
  const chars = align.characters;
  const starts = align.characterStartTimesSeconds;
  const ends = align.characterEndTimesSeconds;
  const words: Word[] = [];
  let buf: string[] = [];
  let wordStart = -1;
  let lastNonSpaceEnd = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    if (/\s/.test(ch)) {
      if (buf.length > 0 && wordStart >= 0) {
        words.push({
          text: buf.join(''),
          startSec: wordStart,
          endSec: lastNonSpaceEnd,
        });
      }
      buf = [];
      wordStart = -1;
      continue;
    }
    if (wordStart < 0) wordStart = starts[i] ?? 0;
    buf.push(ch);
    lastNonSpaceEnd = ends[i] ?? lastNonSpaceEnd;
  }
  if (buf.length > 0 && wordStart >= 0) {
    words.push({ text: buf.join(''), startSec: wordStart, endSec: lastNonSpaceEnd });
  }
  return words;
}

function classifyIntent(text: string, startSec: number, isFirst: boolean): ChunkIntent {
  const lower = text.toLowerCase();
  if (CTA_KEYWORDS.some((kw) => lower.includes(kw))) return 'CTA';
  if (isFirst || startSec < HOOK_TIME_THRESHOLD_SEC) return 'HOOK';
  if (HOOK_KEYWORDS.some((kw) => lower.includes(kw)) && startSec < 4.0) return 'HOOK';
  return 'BODY';
}

function endsSentence(word: string): boolean {
  return /[.!?]$/.test(word);
}

function endsClause(word: string): boolean {
  return /[,;:]$/.test(word);
}

function groupChunks(words: Word[]): Chunk[] {
  const chunks: Chunk[] = [];
  let bufWords: Word[] = [];

  function flushChunk(): void {
    if (bufWords.length === 0) return;
    const text = bufWords.map((w) => w.text).join(' ');
    const startSec = bufWords[0]!.startSec;
    const endSec = bufWords[bufWords.length - 1]!.endSec;
    const idx = chunks.length;
    const isFirst = idx === 0;
    chunks.push({
      index: idx,
      intent: classifyIntent(text, startSec, isFirst),
      text,
      startSec,
      endSec,
      words: bufWords,
    });
    bufWords = [];
  }

  for (const w of words) {
    bufWords.push(w);
    const chunkText = bufWords.map((x) => x.text).join(' ');
    const chunkChars = chunkText.length;
    const chunkDur = w.endSec - bufWords[0]!.startSec;

    const hardFlush =
      bufWords.length >= MAX_WORDS_PER_CHUNK ||
      chunkChars >= MAX_CHARS_PER_CHUNK ||
      chunkDur >= MAX_CHUNK_DURATION_SEC ||
      endsSentence(w.text);

    const softFlush = bufWords.length >= 3 && endsClause(w.text);

    if (hardFlush || softFlush) flushChunk();
  }
  flushChunk();
  return chunks;
}

interface StyleDef {
  name: string;
  fontname: string;
  fontsize: number;
  primaryColour: string;
  secondaryColour: string;
  outlineColour: string;
  bold: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginV: number;
}

const STYLE_HOOK: StyleDef = {
  name: 'HookStyle',
  fontname: 'Arial Black',
  fontsize: 96,
  primaryColour: '&H00FFFFFF', // white
  secondaryColour: '&H000019FF', // unused for active highlight (we override inline)
  outlineColour: '&H00000000', // black
  bold: 1,
  outline: 6,
  shadow: 3,
  alignment: 2,
  marginV: 440,
};

const STYLE_BODY: StyleDef = {
  name: 'BodyStyle',
  fontname: 'Arial Black',
  fontsize: 78,
  primaryColour: '&H00FFFFFF', // white
  secondaryColour: '&H00FFFF00', // unused
  outlineColour: '&H00000000', // black
  bold: 1,
  outline: 5,
  shadow: 2,
  alignment: 2,
  marginV: 420,
};

const STYLE_CTA: StyleDef = {
  name: 'CTAStyle',
  fontname: 'Arial Black',
  fontsize: 88,
  primaryColour: '&H0000FFFF', // yellow (BGR for #FFFF00)
  secondaryColour: '&H00FFFFFF', // white
  outlineColour: '&H00000000', // black
  bold: 1,
  outline: 6,
  shadow: 3,
  alignment: 2,
  marginV: 420,
};

// Active-word highlight color per intent (ASS &HBBGGRR&).
function activeColorForIntent(intent: ChunkIntent): string {
  switch (intent) {
    case 'HOOK':
      return '&H00FFFF&'; // yellow (BGR for #FFFF00)
    case 'CTA':
      return '&HFFFFFF&'; // white on yellow base
    default:
      return '&HFFFF00&'; // cyan (BGR for #00FFFF)
  }
}

function styleNameForIntent(intent: ChunkIntent): string {
  switch (intent) {
    case 'HOOK':
      return STYLE_HOOK.name;
    case 'CTA':
      return STYLE_CTA.name;
    default:
      return STYLE_BODY.name;
  }
}

function buildStyleLine(s: StyleDef): string {
  // Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour,
  // OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX,
  // ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL,
  // MarginR, MarginV, Encoding
  return [
    'Style:',
    [
      s.name,
      s.fontname,
      s.fontsize,
      s.primaryColour,
      s.secondaryColour,
      s.outlineColour,
      '&H00000000', // BackColour
      s.bold,
      0, // Italic
      0, // Underline
      0, // StrikeOut
      100, // ScaleX
      100, // ScaleY
      0, // Spacing
      0, // Angle
      1, // BorderStyle (1 = outline+shadow)
      s.outline,
      s.shadow,
      s.alignment,
      40, // MarginL
      40, // MarginR
      s.marginV,
      1, // Encoding (1 = default)
    ].join(','),
  ].join(' ');
}

// Build ASS file content. For each chunk, emit one Dialogue event per word:
// shows the whole chunk text with the current word highlighted in the active
// color (inline {\1c&...&}word{\r}). Event spans from word.startSec to the
// next word's startSec (or chunk.endSec for the last word) so the highlight
// "slides" through the chunk.
function buildAssContent(chunks: Chunk[]): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.601',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildStyleLine(STYLE_HOOK),
    buildStyleLine(STYLE_BODY),
    buildStyleLine(STYLE_CTA),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events: string[] = [];
  for (const chunk of chunks) {
    const styleName = styleNameForIntent(chunk.intent);
    const activeColor = activeColorForIntent(chunk.intent);
    for (let i = 0; i < chunk.words.length; i++) {
      const word = chunk.words[i]!;
      const start = word.startSec;
      const end =
        i < chunk.words.length - 1
          ? chunk.words[i + 1]!.startSec
          : Math.max(chunk.endSec, word.endSec);
      if (end <= start) continue;
      const parts = chunk.words.map((w, j) =>
        j === i
          ? `{\\1c${activeColor}}${escapeAssText(w.text)}{\\r}`
          : escapeAssText(w.text),
      );
      const text = parts.join(' ');
      events.push(
        `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},${styleName},,0,0,0,,${text}`,
      );
    }
  }
  return [...header, ...events, ''].join('\n');
}

function checkVideoIsPlaceholder(runDir: string): boolean {
  const previewArtifactPath = join(runDir, 'preview_artifact.json');
  if (!existsSync(previewArtifactPath)) return false;
  try {
    const a = JSON.parse(readFileSync(previewArtifactPath, 'utf8'));
    return a.offlinePlaceholderOnly === true || a.hasRealFixture === false;
  } catch {
    return false;
  }
}

function writeArtifact(path: string, obj: object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      run: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      preset: { type: 'string', default: 'viral_review_v1' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const runId = values.run;
  if (!runId) {
    console.error('Error: --run <runId> is required');
    process.exit(1);
  }

  const runDir = resolve('data/temp/pipeline-p9-demo', runId);
  const timingPath = join(runDir, 'voice_timing_artifact.json');
  const inputVideo = values.input ? resolve(values.input) : join(runDir, 'preview.mp4');
  const outputVideo = values.output
    ? resolve(values.output)
    : join(runDir, 'preview_with_captions.mp4');
  const assPath = join(runDir, 'kinetic_captions.ass');
  const planPath = join(runDir, 'kinetic_caption_plan.json');

  console.log('======================================================');
  console.log('💬  VFOS Kinetic Caption Renderer v1');
  console.log('======================================================');
  console.log(`Run:            ${runId}`);
  console.log(`Run dir:        ${runDir}`);
  console.log(`Timing:         ${timingPath}`);
  console.log(`Input video:    ${inputVideo}`);
  console.log(`Output video:   ${outputVideo}`);
  console.log(`ASS out:        ${assPath}`);
  console.log(`Plan out:       ${planPath}`);
  console.log(`Preset:         ${values.preset}`);
  console.log(`Mode:           ${values['dry-run'] ? '🔍 DRY-RUN' : '🎬 RENDER'}`);
  console.log('------------------------------------------------------');

  if (!existsSync(timingPath)) {
    const artifact = {
      captionPlanVersion: 'v1',
      runId,
      status: 'MISSING_TIMING_ARTIFACT',
      timingPath,
      notes: `voice_timing_artifact.json not found. Run: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`,
    };
    writeArtifact(planPath, artifact);
    console.error('MISSING_TIMING_ARTIFACT — no timing artifact found.');
    console.error(`  Suggested: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`);
    process.exit(1);
  }

  let timing: TimingArtifact;
  try {
    timing = JSON.parse(readFileSync(timingPath, 'utf8')) as TimingArtifact;
  } catch (err) {
    console.error(`Error: failed to parse timing artifact: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!timing.alignment || !Array.isArray(timing.alignment.characters)) {
    console.error('Error: timing.alignment.characters missing or invalid');
    process.exit(1);
  }

  const words = groupWords(timing.alignment);
  const chunks = groupChunks(words);
  console.log(`Words:          ${words.length}`);
  console.log(`Chunks:         ${chunks.length} (HOOK=${chunks.filter((c) => c.intent === 'HOOK').length}, BODY=${chunks.filter((c) => c.intent === 'BODY').length}, CTA=${chunks.filter((c) => c.intent === 'CTA').length})`);
  if (chunks.length > 0) {
    const lastChunk = chunks[chunks.length - 1]!;
    console.log(`Caption span:   ${chunks[0]!.startSec.toFixed(2)}s → ${lastChunk.endSec.toFixed(2)}s`);
  }

  const isPlaceholder = checkVideoIsPlaceholder(runDir);
  if (isPlaceholder) {
    console.warn('⚠️  INPUT_VIDEO_MAY_BE_PLACEHOLDER_DO_NOT_APPROVE');
    console.warn('  preview_artifact.json indicates placeholder/testsrc render.');
    console.warn('  Captions will be burned for technical test only.');
  }

  // Always write plan (even dry-run).
  const plan = {
    captionPlanVersion: 'v1',
    runId,
    sourceTimingPath: timingPath,
    inputVideoPath: inputVideo,
    outputVideoPath: outputVideo,
    assPath,
    stylePreset: values.preset,
    isPlaceholderInput: isPlaceholder,
    placeholderWarning: isPlaceholder
      ? 'INPUT_VIDEO_MAY_BE_PLACEHOLDER_DO_NOT_APPROVE'
      : null,
    chunks: chunks.map((c) => ({
      index: c.index,
      intent: c.intent,
      text: c.text,
      startSec: Number(c.startSec.toFixed(3)),
      endSec: Number(c.endSec.toFixed(3)),
      words: c.words.map((w) => ({
        text: w.text,
        startSec: Number(w.startSec.toFixed(3)),
        endSec: Number(w.endSec.toFixed(3)),
      })),
    })),
    safety: {
      apiCalled: false,
      uploaded: false,
      published: false,
      usesLocalTimingOnly: true,
    },
    status: values['dry-run'] ? 'DRY_RUN_PLAN_ONLY' : 'PENDING_RENDER',
    generatedAt: new Date().toISOString(),
  };
  writeArtifact(planPath, plan);

  if (values['dry-run']) {
    console.log(`DRY-RUN complete. Plan persisted: ${planPath}`);
    console.log('No ASS written. No FFmpeg call.');
    process.exit(0);
  }

  if (!existsSync(inputVideo)) {
    const failPlan = { ...plan, status: 'MISSING_INPUT_VIDEO' };
    writeArtifact(planPath, failPlan);
    console.error('MISSING_INPUT_VIDEO — input video not found.');
    console.error(`  Suggested: pnpm chay (to generate preview)`);
    process.exit(1);
  }

  // Write ASS file with UTF-8 BOM (libass benefits from explicit BOM).
  const assContent = buildAssContent(chunks);
  mkdirSync(dirname(assPath), { recursive: true });
  writeFileSync(assPath, '﻿' + assContent, 'utf8');
  console.log(`ASS written:    ${assPath} (${chunks.reduce((n, c) => n + c.words.length, 0)} events)`);

  // Run FFmpeg from runDir cwd so the `subtitles=` filter can reference the
  // ASS by filename (avoids Windows drive-letter escaping pain).
  const inputRel = inputVideo.startsWith(runDir)
    ? basename(inputVideo)
    : inputVideo.replace(/\\/g, '/');
  const outputRel = outputVideo.startsWith(runDir)
    ? basename(outputVideo)
    : outputVideo.replace(/\\/g, '/');
  const assRel = basename(assPath);

  const ffmpegArgs = [
    '-y',
    '-i',
    inputRel,
    '-vf',
    `subtitles=${assRel}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-c:a',
    'copy',
    outputRel,
  ];

  console.log(`FFmpeg cwd:     ${runDir}`);
  console.log(`FFmpeg cmd:     ffmpeg ${ffmpegArgs.join(' ')}`);
  const ff = spawnSync('ffmpeg', ffmpegArgs, {
    cwd: runDir,
    encoding: 'utf-8',
  });

  if (ff.status !== 0) {
    const failPlan = {
      ...plan,
      status: 'FFMPEG_FAILED',
      ffmpegExitCode: ff.status,
      ffmpegStderrTail: (ff.stderr ?? '').slice(-800),
    };
    writeArtifact(planPath, failPlan);
    console.error('FFMPEG_FAILED — caption burn failed.');
    console.error(ff.stderr?.slice(-800) ?? '(no stderr)');
    process.exit(1);
  }

  const successPlan = {
    ...plan,
    status: 'SUCCESS',
    completedAt: new Date().toISOString(),
  };
  writeArtifact(planPath, successPlan);

  console.log('======================================================');
  console.log('SUCCESS — captioned video written.');
  console.log(`  Output:    ${outputVideo}`);
  console.log(`  ASS:       ${assPath}`);
  console.log(`  Plan:      ${planPath}`);
  if (isPlaceholder) {
    console.log('  ⚠️  Input was placeholder. Replace fixture + re-render before approval.');
  }
  console.log('======================================================');
}

main().catch((err) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
