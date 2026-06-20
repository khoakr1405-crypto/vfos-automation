// TTS provider abstraction for the entertainment lane.
// edge-tts (free, Nam HoaiMy/NamMinh) is the TEMPORARY operative provider;
// the long-term goal is an ElevenLabs voice (gated on billing). Keeping the
// provider behind one interface means switching edge→elevenlabs later does not
// require rewriting steps 05/06.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type TtsProvider = 'edge' | 'elevenlabs';

export const EDGE_MALE_VOICE = 'vi-VN-NamMinhNeural';
export const EDGE_FEMALE_VOICE = 'vi-VN-HoaiMyNeural';
export const EDGE_RATE = '+18%'; // lv2 energy
export const EDGE_PITCH = '+22Hz';

const EDGE_PY = 'tools/edge-tts-voice/.venv/Scripts/python.exe';
const EDGE_SCRIPT = 'tools/edge-tts-voice/synthesize.py';

export interface EdgeWord {
  text: string;
  offsetSec: number;
  durationSec: number;
}

/** Synthesize one Vietnamese text chunk via edge-tts. Writes outAudio (mp3)
 *  and returns the word-boundary list (relative to chunk start). */
export function synthEdge(opts: {
  text: string;
  voice: string;
  outAudio: string;
  outWords: string;
  rate?: string;
  pitch?: string;
}): EdgeWord[] {
  // synthesize.py expects --text-file (not inline text); write a sidecar .txt.
  const textFile = `${opts.outAudio}.txt`;
  writeFileSync(textFile, opts.text, 'utf8');
  const args = [
    EDGE_SCRIPT,
    '--text-file',
    textFile,
    '--voice',
    opts.voice,
    '--rate',
    opts.rate ?? EDGE_RATE,
    '--pitch',
    opts.pitch ?? EDGE_PITCH,
    '--out-audio',
    opts.outAudio,
    '--out-words',
    opts.outWords,
  ];
  // edge-tts (Microsoft online service) throws NoAudioReceived intermittently
  // when many chunks are requested back-to-back — retry with backoff.
  const MAX_TRIES = 4;
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    const r = spawnSync(EDGE_PY, args, { encoding: 'utf8' });
    if (r.status === 0 && existsSync(opts.outAudio) && existsSync(opts.outWords)) {
      const parsed = JSON.parse(readFileSync(opts.outWords, 'utf8')) as { words?: EdgeWord[] };
      return parsed.words ?? [];
    }
    lastErr = (r.stderr ?? '').slice(-300);
    if (attempt < MAX_TRIES) sleepSync(900 * attempt);
  }
  throw new Error(`EDGE_TTS_FAILED after ${MAX_TRIES} tries: ${lastErr}`);
}

/** Blocking sleep for the synchronous retry loop (no async plumbing needed). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Provider router. ElevenLabs is intentionally disabled until billing is
 *  restored — surfaces a clear error instead of silently failing. */
export function synthesizeChunk(
  provider: TtsProvider,
  opts: {
    text: string;
    voice: string;
    outAudio: string;
    outWords: string;
    rate?: string;
    pitch?: string;
  },
): EdgeWord[] {
  if (provider === 'edge') return synthEdge(opts);
  throw new Error(
    'ELEVENLABS_DISABLED: provider elevenlabs chưa bật (billing chưa gỡ). Dùng --provider edge.',
  );
}

export interface CharAlign {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

/** Convert edge word boundaries → char-level alignment (clip-relative), the
 *  format scripts/kinetic-caption-renderer.ts consumes. Distributes chars
 *  evenly inside each word and inserts a space separator after each word. */
export function wordsToCharAlign(words: EdgeWord[], baseOffsetSec: number): CharAlign {
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (const w of words) {
    const wStart = baseOffsetSec + w.offsetSec;
    const wEnd = wStart + w.durationSec;
    const chars = [...w.text];
    const per = chars.length > 0 ? (wEnd - wStart) / chars.length : 0;
    chars.forEach((c, i) => {
      characters.push(c);
      starts.push(wStart + i * per);
      ends.push(wStart + (i + 1) * per);
    });
    characters.push(' ');
    starts.push(wEnd);
    ends.push(wEnd);
  }
  return {
    characters,
    characterStartTimesSeconds: starts,
    characterEndTimesSeconds: ends,
  };
}

/** Resolve the edge venv python path (absolute) under repo root, for guards. */
export function edgePythonExists(repoRoot: string): boolean {
  return existsSync(join(repoRoot, EDGE_PY));
}
