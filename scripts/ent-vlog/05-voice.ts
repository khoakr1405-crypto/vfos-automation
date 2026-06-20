// E1 step 05 — Vietnamese voice-over (edge-tts Nam) for an APPROVED clip.
// GATE: requires --approved (operator passed the translation review gate).
// Produces clip_<n>_vo.mp3 (timed VO track) + clip_<n>_voice_timing_artifact.json
// (char-level alignment, clip-relative) for the kinetic caption renderer.
//   pnpm tsx scripts/ent-vlog/05-voice.ts --id ent_squid_001 --clip clip_1 --approved
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';
import {
  type CharAlign,
  EDGE_MALE_VOICE,
  type TtsProvider,
  synthesizeChunk,
  wordsToCharAlign,
} from './lib/tts-provider.js';

interface TransSeg {
  id: number;
  start: number;
  end: number;
  vi: string;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      clip: { type: 'string' },
      approved: { type: 'boolean', default: false },
      provider: { type: 'string' },
      voice: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  const clipId = values.clip ?? 'clip_1';
  if (!id) {
    console.error('Usage: --id <slug> --clip <clipId> --approved');
    process.exit(1);
  }
  if (!values.approved) {
    console.error(
      '🛑 GATE: thiếu --approved. Bản dịch phải được Operator duyệt trước khi lồng tiếng.',
    );
    process.exit(1);
  }
  const provider = (values.provider as TtsProvider) ?? 'edge';
  const voice = values.voice ?? EDGE_MALE_VOICE;

  const dir = workDir(id);
  const transPath = join(dir, `${clipId}_translation_vi.json`);
  if (!existsSync(transPath)) {
    console.error(`🛑 ${clipId}_translation_vi.json missing — chạy 04-translate trước.`);
    process.exit(1);
  }
  const trans = JSON.parse(readFileSync(transPath, 'utf8')) as {
    startSec: number;
    durationSec: number;
    segments: TransSeg[];
  };
  const clipStart = trans.startSec;
  const segs = trans.segments.filter((s) => s.vi.trim().length > 0);
  if (segs.length === 0) {
    console.error('🛑 Không có lời để lồng tiếng.');
    process.exit(2);
  }

  const tmp = join(dir, '_tts_tmp', clipId);
  mkdirSync(tmp, { recursive: true });

  // Synthesize each segment + collect char-level alignment (clip-relative).
  const segMp3: string[] = [];
  const delaysMs: number[] = [];
  const align: CharAlign = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  console.log(`[05] Lồng tiếng ${segs.length} đoạn (${provider}, ${voice})…`);
  for (const s of segs) {
    const outAudio = join(tmp, `seg_${s.id}.mp3`);
    const outWords = join(tmp, `seg_${s.id}.words.json`);
    const words = synthesizeChunk(provider, { text: s.vi, voice, outAudio, outWords });
    if (!existsSync(outAudio)) continue;
    const relStart = Math.max(0, s.start - clipStart);
    segMp3.push(outAudio);
    delaysMs.push(Math.round(relStart * 1000));
    const a = wordsToCharAlign(words, relStart);
    align.characters.push(...a.characters);
    align.characterStartTimesSeconds.push(...a.characterStartTimesSeconds);
    align.characterEndTimesSeconds.push(...a.characterEndTimesSeconds);
  }
  if (segMp3.length === 0) {
    console.error('🛑 Không tổng hợp được audio đoạn nào.');
    process.exit(3);
  }

  // Assemble timed VO track: adelay each segment then amix.
  const voOut = join(dir, `${clipId}_vo.mp3`);
  const inputs: string[] = [];
  for (const p of segMp3) inputs.push('-i', p);
  let filter: string;
  if (segMp3.length === 1) {
    filter = `[0:a]adelay=${delaysMs[0]}:all=1[out]`;
  } else {
    const parts = segMp3.map((_, i) => `[${i}:a]adelay=${delaysMs[i]}:all=1[a${i}]`);
    const mixIn = segMp3.map((_, i) => `[a${i}]`).join('');
    filter = `${parts.join(';')};${mixIn}amix=inputs=${segMp3.length}:normalize=0:dropout_transition=0[out]`;
  }
  const dur = trans.durationSec.toFixed(2);
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      ...inputs,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-t',
      dur,
      '-ar',
      '44100',
      '-ac',
      '2',
      voOut,
    ],
    { encoding: 'utf8' },
  );
  if (ff.status !== 0) {
    console.error(`🛑 VO_ASSEMBLE_FAILED: ${(ff.stderr ?? '').slice(-800)}`);
    process.exit(4);
  }

  // Char-level timing artifact (renderer contract).
  const timing = {
    timingVersion: 'ent-v1',
    runId: `${id}_${clipId}`,
    provider,
    voice,
    clipStartSec: clipStart,
    alignment: align,
    captionReady: true,
  };
  writeFileSync(join(dir, `${clipId}_voice_timing_artifact.json`), JSON.stringify(timing, null, 2));

  console.log('------------------------------------------------------');
  console.log(`[05] ✅ VO: ${voOut}`);
  console.log(
    `     timing: ${clipId}_voice_timing_artifact.json (${align.characters.length} chars)`,
  );
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
