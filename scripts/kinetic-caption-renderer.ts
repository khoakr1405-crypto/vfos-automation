#!/usr/bin/env tsx

/**
 * VFOS Kinetic Caption Renderer — Rounds 34A + 34B.
 *
 * Đọc voice_timing_artifact.json (character-level alignment từ Round 33),
 * group chars → words → caption chunks theo preset, phân loại
 * HOOK/BODY/CTA, generate ASS subtitle với active-word highlight, burn
 * vào video bằng FFmpeg.
 *
 * Presets:
 *   - viral_review_v1 (Round 34A baseline, backward-compatible default)
 *   - viral_review_v2 (Round 34B viral polish: hook pop-in, uppercase
 *     hook/CTA, keyword emphasis, tighter chunking)
 *
 * Outputs trong data/temp/pipeline-p9-demo/<runId>/ (v1 mặc định, v2 có
 * suffix _v2 để không ghi đè v1):
 *   - kinetic_caption_plan[_v2].json   (plan + chunks + words timing)
 *   - kinetic_captions[_v2].ass        (ASS subtitle file, UTF-8 BOM)
 *   - preview_with_captions[_v2].mp4   (final captioned video)
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
 *   pnpm caption:kinetic --run <id> --preset viral_review_v2
 *   pnpm caption:kinetic --run <id> --input <video> --output <out.mp4>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, resolve } from 'node:path';
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

interface ChunkingThresholds {
  maxWords: number;
  maxChars: number;
  maxDurationSec: number;
}

interface Preset {
  name: string;
  outputSuffix: string;
  hookWindowSec: number;
  chunkingHook: ChunkingThresholds;
  chunkingBody: ChunkingThresholds;
  softFlushMinWords: number;
  styles: {
    hook: StyleDef;
    body: StyleDef;
    cta: StyleDef;
  };
  activeColorInline: {
    hook: string;
    body: string;
    cta: string;
  };
  effects: {
    hookPopIn: boolean;
    uppercaseHook: boolean;
    uppercaseCTA: boolean;
    keywordEmphasis: boolean;
  };
  keywordEmphasisColorInline: string;
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

// v2 emphasis keyword set — Vietnamese review/marketing power words.
const EMPHASIS_KEYWORDS = new Set([
  'siêu',
  'cực',
  'hot',
  'đỉnh',
  'mát',
  'rẻ',
  'pin',
  'khủng',
  'xịn',
  'ngon',
  'hời',
  'mạnh',
  'bảo',
  'bảo bối',
]);
// Price-like tokens (200K, 50K, 1M).
const EMPHASIS_PRICE_RE = /^\d+[kKmM]$/;

const PRESET_V1: Preset = {
  name: 'viral_review_v1',
  outputSuffix: '',
  hookWindowSec: 2.5,
  chunkingHook: { maxWords: 5, maxChars: 28, maxDurationSec: 2.2 },
  chunkingBody: { maxWords: 5, maxChars: 28, maxDurationSec: 2.2 },
  softFlushMinWords: 3,
  styles: {
    hook: {
      name: 'HookStyle',
      fontname: 'Arial Black',
      fontsize: 96,
      primaryColour: '&H00FFFFFF',
      secondaryColour: '&H000019FF',
      outlineColour: '&H00000000',
      bold: 1,
      outline: 6,
      shadow: 3,
      alignment: 2,
      marginV: 440,
    },
    body: {
      name: 'BodyStyle',
      fontname: 'Arial Black',
      fontsize: 78,
      primaryColour: '&H00FFFFFF',
      secondaryColour: '&H00FFFF00',
      outlineColour: '&H00000000',
      bold: 1,
      outline: 5,
      shadow: 2,
      alignment: 2,
      marginV: 420,
    },
    cta: {
      name: 'CTAStyle',
      fontname: 'Arial Black',
      fontsize: 88,
      primaryColour: '&H0000FFFF',
      secondaryColour: '&H00FFFFFF',
      outlineColour: '&H00000000',
      bold: 1,
      outline: 6,
      shadow: 3,
      alignment: 2,
      marginV: 420,
    },
  },
  activeColorInline: {
    hook: '&H00FFFF&',
    body: '&HFFFF00&',
    cta: '&HFFFFFF&',
  },
  effects: {
    hookPopIn: false,
    uppercaseHook: false,
    uppercaseCTA: false,
    keywordEmphasis: false,
  },
  keywordEmphasisColorInline: '&H0080FF&',
};

const PRESET_V2: Preset = {
  name: 'viral_review_v2',
  outputSuffix: '_v2',
  hookWindowSec: 3.0,
  // HOOK in v2 chunks tightly so visually punchy: max 2 từ, ≤14 chars, ≤1.2s.
  chunkingHook: { maxWords: 2, maxChars: 14, maxDurationSec: 1.2 },
  // BODY in v2 also tighter than v1: 4 từ, ≤24 chars, ≤1.8s.
  chunkingBody: { maxWords: 4, maxChars: 24, maxDurationSec: 1.8 },
  softFlushMinWords: 2,
  styles: {
    hook: {
      name: 'HookStyleV2',
      fontname: 'Arial Black',
      fontsize: 112,
      primaryColour: '&H00FFFFFF',
      secondaryColour: '&H00FFFFFF',
      outlineColour: '&H00000000',
      bold: 1,
      outline: 8,
      shadow: 4,
      alignment: 2,
      marginV: 460,
    },
    body: {
      name: 'BodyStyleV2',
      fontname: 'Arial Black',
      fontsize: 84,
      primaryColour: '&H00FFFFFF',
      secondaryColour: '&H00FFFFFF',
      outlineColour: '&H00000000',
      bold: 1,
      outline: 6,
      shadow: 2,
      alignment: 2,
      marginV: 420,
    },
    cta: {
      name: 'CTAStyleV2',
      fontname: 'Arial Black',
      fontsize: 98,
      primaryColour: '&H0000FFFF', // yellow (BGR for #FFFF00)
      secondaryColour: '&H00FFFFFF',
      outlineColour: '&H000000FF', // red outline (BGR for #FF0000)
      bold: 1,
      outline: 8,
      shadow: 4,
      alignment: 2,
      marginV: 420,
    },
  },
  activeColorInline: {
    hook: '&H00FFFF&', // yellow active highlight
    body: '&HFFFF00&', // cyan active highlight
    cta: '&HFFFFFF&', // white on yellow base
  },
  effects: {
    hookPopIn: true,
    uppercaseHook: true,
    uppercaseCTA: true,
    keywordEmphasis: true,
  },
  keywordEmphasisColorInline: '&H0080FF&', // orange (BGR for #FF8000)
};

const PRESETS: Record<string, Preset> = {
  viral_review_v1: PRESET_V1,
  viral_review_v2: PRESET_V2,
};

function resolvePreset(name: string): Preset | null {
  return PRESETS[name] ?? null;
}

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

function stripPunct(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[.,!?;:'"]+/g, '')
    .replace(/[.,!?;:'"]+$/g, '');
}

function isEmphasisKeyword(word: string): boolean {
  const clean = stripPunct(word);
  if (EMPHASIS_KEYWORDS.has(clean)) return true;
  if (EMPHASIS_PRICE_RE.test(clean)) return true;
  return false;
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
        words.push({ text: buf.join(''), startSec: wordStart, endSec: lastNonSpaceEnd });
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

function classifyIntent(
  text: string,
  startSec: number,
  isFirst: boolean,
  hookWindowSec: number,
): ChunkIntent {
  const lower = text.toLowerCase();
  if (CTA_KEYWORDS.some((kw) => lower.includes(kw))) return 'CTA';
  if (isFirst || startSec < hookWindowSec) return 'HOOK';
  if (HOOK_KEYWORDS.some((kw) => lower.includes(kw)) && startSec < hookWindowSec + 1.5)
    return 'HOOK';
  return 'BODY';
}

function endsSentence(word: string): boolean {
  return /[.!?]$/.test(word);
}

function endsClause(word: string): boolean {
  return /[,;:]$/.test(word);
}

// Group words into chunks using preset thresholds. Thresholds adapt per
// chunk: if the chunk's first word starts within hookWindowSec, use the
// tighter HOOK thresholds; otherwise use BODY.
function groupChunks(words: Word[], preset: Preset): Chunk[] {
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
      intent: classifyIntent(text, startSec, isFirst, preset.hookWindowSec),
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
    const chunkStart = bufWords[0]!.startSec;
    const chunkDur = w.endSec - chunkStart;

    const thresholds =
      chunkStart < preset.hookWindowSec ? preset.chunkingHook : preset.chunkingBody;

    const hardFlush =
      bufWords.length >= thresholds.maxWords ||
      chunkChars >= thresholds.maxChars ||
      chunkDur >= thresholds.maxDurationSec ||
      endsSentence(w.text);

    const softFlush = bufWords.length >= preset.softFlushMinWords && endsClause(w.text);

    if (hardFlush || softFlush) flushChunk();
  }
  flushChunk();
  return chunks;
}

function styleForIntent(preset: Preset, intent: ChunkIntent): StyleDef {
  switch (intent) {
    case 'HOOK':
      return preset.styles.hook;
    case 'CTA':
      return preset.styles.cta;
    default:
      return preset.styles.body;
  }
}

function activeColorForIntent(preset: Preset, intent: ChunkIntent): string {
  switch (intent) {
    case 'HOOK':
      return preset.activeColorInline.hook;
    case 'CTA':
      return preset.activeColorInline.cta;
    default:
      return preset.activeColorInline.body;
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
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      1, // BorderStyle (1 = outline+shadow)
      s.outline,
      s.shadow,
      s.alignment,
      40,
      40,
      s.marginV,
      1,
    ].join(','),
  ].join(' ');
}

// Render a single word for a chunk event. Three exclusive layers:
//   1. If word is the active one → wrap in active color (highest priority).
//   2. Else if keywordEmphasis enabled and word matches emphasis set →
//      wrap in emphasis color.
//   3. Else use plain style primary color.
// Optionally uppercase per preset rules for HOOK/CTA intents.
function renderWordForEvent(
  word: Word,
  isActive: boolean,
  intent: ChunkIntent,
  preset: Preset,
): string {
  let text = word.text;
  if (
    (intent === 'HOOK' && preset.effects.uppercaseHook) ||
    (intent === 'CTA' && preset.effects.uppercaseCTA)
  ) {
    text = text.toLocaleUpperCase('vi-VN');
  }
  const escaped = escapeAssText(text);
  if (isActive) {
    const color = activeColorForIntent(preset, intent);
    return `{\\1c${color}}${escaped}{\\r}`;
  }
  if (preset.effects.keywordEmphasis && isEmphasisKeyword(word.text)) {
    return `{\\1c${preset.keywordEmphasisColorInline}}${escaped}{\\r}`;
  }
  return escaped;
}

// Optional intro override added at the start of HOOK events when popIn is on.
// Scale: 80% → 110% in 120ms → 100% in next 100ms. Pure ASS \t() transform.
const HOOK_POP_IN_PREFIX =
  '{\\fscx80\\fscy80\\t(0,120,\\fscx110\\fscy110)\\t(120,220,\\fscx100\\fscy100)}';

function buildAssContent(chunks: Chunk[], preset: Preset): string {
  const header = [
    '[Script Info]',
    `; Generated by VFOS Kinetic Caption Renderer — preset=${preset.name}`,
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.601',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    buildStyleLine(preset.styles.hook),
    buildStyleLine(preset.styles.body),
    buildStyleLine(preset.styles.cta),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events: string[] = [];
  for (const chunk of chunks) {
    const style = styleForIntent(preset, chunk.intent);
    const popInPrefix =
      chunk.intent === 'HOOK' && preset.effects.hookPopIn ? HOOK_POP_IN_PREFIX : '';
    for (let i = 0; i < chunk.words.length; i++) {
      const word = chunk.words[i]!;
      const start = word.startSec;
      const end =
        i < chunk.words.length - 1
          ? chunk.words[i + 1]!.startSec
          : Math.max(chunk.endSec, word.endSec);
      if (end <= start) continue;
      const parts = chunk.words.map((w, j) =>
        renderWordForEvent(w, j === i, chunk.intent, preset),
      );
      const text = popInPrefix + parts.join(' ');
      events.push(
        `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},${style.name},,0,0,0,,${text}`,
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

function withSuffix(path: string, suffix: string): string {
  if (!suffix) return path;
  const ext = extname(path);
  const dir = dirname(path);
  const base = basename(path, ext);
  return join(dir, base + suffix + ext);
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      run: { type: 'string' },
      job: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      timing: { type: 'string' },
      'plan-output': { type: 'string' },
      'ass-output': { type: 'string' },
      preset: { type: 'string', default: 'viral_review_v1' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const jobId = (values.job as string | undefined) ?? null;
  const runId = jobId ? null : (values.run as string | undefined) ?? null;

  if (!jobId && !runId) {
    console.error('Error: --run <runId> or --job <jobId> is required');
    process.exit(1);
  }

  const preset = resolvePreset(values.preset ?? 'viral_review_v1');
  if (!preset) {
    console.error(`Error: unknown preset "${values.preset}". Available: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  const JOBS_ROOT = 'data/temp/jobs';
  const effectiveRunId = jobId ? `run_${jobId}` : runId!;
  const runDir = jobId ? resolve(JOBS_ROOT, jobId) : resolve('data/temp/pipeline-p9-demo', runId!);

  const timingPath = values.timing ? resolve(values.timing as string) : join(runDir, 'voice_timing_artifact.json');
  const inputVideo = values.input ? resolve(values.input as string) : join(runDir, 'preview.mp4');
  const outputVideo = values.output
    ? resolve(values.output as string)
    : withSuffix(join(runDir, 'preview_with_captions.mp4'), preset.outputSuffix);
  const assPath = values['ass-output']
    ? resolve(values['ass-output'] as string)
    : withSuffix(join(runDir, 'kinetic_captions.ass'), preset.outputSuffix);
  const planPath = values['plan-output']
    ? resolve(values['plan-output'] as string)
    : withSuffix(join(runDir, 'kinetic_caption_plan.json'), preset.outputSuffix);

  console.log('======================================================');
  console.log(`💬  VFOS Kinetic Caption Renderer (${preset.name})`);
  console.log('======================================================');
  if (jobId) {
    console.log(`Job ID:         ${jobId}`);
  } else {
    console.log(`Run:            ${runId}`);
  }
  console.log(`Run dir:        ${runDir}`);
  console.log(`Timing:         ${timingPath}`);
  console.log(`Input video:    ${inputVideo}`);
  console.log(`Output video:   ${outputVideo}`);
  console.log(`ASS out:        ${assPath}`);
  console.log(`Plan out:       ${planPath}`);
  console.log(`Preset:         ${preset.name}`);
  console.log(`Mode:           ${values['dry-run'] ? '🔍 DRY-RUN' : '🎬 RENDER'}`);
  console.log('------------------------------------------------------');

  if (!existsSync(timingPath)) {
    if (jobId) {
      console.error('🛑 MISSING_JOB_TIMING_ARTIFACT');
      console.error(`  Timing artifact not found in job folder: ${timingPath}`);
      console.error(`  Generate first via: pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);
    } else {
      console.error('MISSING_TIMING_ARTIFACT — no timing artifact found.');
      console.error(`  Suggested: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`);
    }
    const artifact = {
      captionPlanVersion: 'v1',
      runId: effectiveRunId,
      status: 'MISSING_TIMING_ARTIFACT',
      timingPath,
      notes: jobId
        ? `voice_timing_artifact.json not found in job folder. Run: pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`
        : `voice_timing_artifact.json not found. Run: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`,
    };
    writeArtifact(planPath, artifact);
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
  const chunks = groupChunks(words, preset);
  console.log(`Words:          ${words.length}`);
  console.log(
    `Chunks:         ${chunks.length} (HOOK=${chunks.filter((c) => c.intent === 'HOOK').length}, BODY=${chunks.filter((c) => c.intent === 'BODY').length}, CTA=${chunks.filter((c) => c.intent === 'CTA').length})`,
  );
  if (chunks.length > 0) {
    const lastChunk = chunks[chunks.length - 1]!;
    console.log(`Caption span:   ${chunks[0]!.startSec.toFixed(2)}s → ${lastChunk.endSec.toFixed(2)}s`);
  }
  if (preset.effects.keywordEmphasis) {
    const emphasized = words.filter((w) => isEmphasisKeyword(w.text)).length;
    console.log(`Emphasis words: ${emphasized} (orange highlight when not currently active)`);
  }

  const isPlaceholder = checkVideoIsPlaceholder(runDir);
  if (isPlaceholder) {
    console.warn('⚠️  INPUT_VIDEO_MAY_BE_PLACEHOLDER_DO_NOT_APPROVE');
    console.warn(
      '  This caption preview is for text style testing only. Do not approve/publish until real product footage is provided.',
    );
  }

  const plan = {
    captionPlanVersion: preset.outputSuffix === '_v2' ? 'v2' : 'v1',
    runId: effectiveRunId,
    sourceTimingPath: timingPath,
    inputVideoPath: inputVideo,
    outputVideoPath: outputVideo,
    assPath,
    stylePreset: preset.name,
    presetEffects: preset.effects,
    isPlaceholderInput: isPlaceholder,
    placeholderWarning: isPlaceholder ? 'INPUT_VIDEO_MAY_BE_PLACEHOLDER_DO_NOT_APPROVE' : null,
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
        emphasis: preset.effects.keywordEmphasis ? isEmphasisKeyword(w.text) : false,
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
    if (jobId) {
      console.error('🛑 MISSING_JOB_PREVIEW_VIDEO');
      console.error(`  Preview video not found in job folder: ${inputVideo}`);
      console.error('  Render first via review-video-orchestrator.');
    } else {
      console.error('MISSING_INPUT_VIDEO — input video not found.');
      console.error(`  Suggested: pnpm chay (to generate preview)`);
    }
    const failPlan = { ...plan, status: 'MISSING_INPUT_VIDEO' };
    writeArtifact(planPath, failPlan);
    process.exit(1);
  }

  const assContent = buildAssContent(chunks, preset);
  mkdirSync(dirname(assPath), { recursive: true });
  // UTF-8 BOM for libass non-ASCII robustness.
  writeFileSync(assPath, '﻿' + assContent, 'utf8');
  console.log(
    `ASS written:    ${assPath} (${chunks.reduce((n, c) => n + c.words.length, 0)} events)`,
  );

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
  const ff = spawnSync('ffmpeg', ffmpegArgs, { cwd: runDir, encoding: 'utf-8' });

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

  const successPlan = { ...plan, status: 'SUCCESS', completedAt: new Date().toISOString() };
  writeArtifact(planPath, successPlan);

  if (jobId) {
    const manifestPath = join(runDir, 'job_manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const jobManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const suffix = preset.outputSuffix;
        const captionedRel = `${JOBS_ROOT}/${jobId}/preview_with_captions${suffix}.mp4`;
        jobManifest.artifacts.captionedPreviewPath = captionedRel;
        jobManifest.updatedAt = new Date().toISOString();
        writeFileSync(manifestPath, JSON.stringify(jobManifest, null, 2) + '\n', 'utf8');

        // Also update vfos_jobs_registry.json so list command works
        const registryPath = resolve('data/temp/vfos_jobs_registry.json');
        if (existsSync(registryPath)) {
          const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
          const idx = reg.jobs.findIndex((j: any) => j.jobId === jobId);
          if (idx >= 0) {
            reg.jobs[idx].captionedPreviewPath = captionedRel;
            reg.jobs[idx].updatedAt = jobManifest.updatedAt;
            writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
          }
        }
      } catch {}
    }
  }

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
