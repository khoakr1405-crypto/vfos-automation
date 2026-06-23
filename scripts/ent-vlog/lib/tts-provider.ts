// TTS provider abstraction for the entertainment lane.
// edge-tts (free, Nam HoaiMy/NamMinh) is the TEMPORARY operative provider;
// the long-term goal is an ElevenLabs voice (gated on billing). Keeping the
// provider behind one interface means switching edge→elevenlabs later does not
// require rewriting steps 05/06.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ElevenLabsClient } from '../../../packages/voice/src/elevenlabs-client.js';
import type { CharAlignment, VoiceSettings } from '../../../packages/voice/src/types.js';

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
  // ElevenLabs is async (/with-timestamps fetch) and cannot be served by this
  // synchronous router — step 12 calls synthEleven() directly for that branch.
  throw new Error(
    'ELEVENLABS_SYNC_UNSUPPORTED: provider elevenlabs là async — gọi synthEleven() trực tiếp (xem 12-voice-render).',
  );
}

// ── ElevenLabs provider (async, /with-timestamps) ───────────────────────────
// Long-term operative voice. Gated behind env ENT_TTS_PROVIDER=elevenlabs so it
// never runs by accident (default stays edge → no credit burn). Three credit
// guards: (1) per-chunk content-hash cache → re-renders cost 0; (2) caller-side
// pre-flight quota gate counts only UNCACHED chars; (3) FAIL honest on API error
// (no silent edge fallback → never a two-voice video).

// Voice settings for the entertainment lane. Mirrors the edge "lv2 energy" feel
// (slightly faster, expressive) without edge's rate/pitch knobs.
const ELEVEN_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.8,
  style: 0.3,
  speed: 1.05,
};

// Cache lives under runtime data/temp (gitignored) — keyed by text+voice+model+
// settings so identical chunks are never re-billed.
const ELEVEN_CACHE_DIR = 'data/temp/ent/_tts_cache/elevenlabs';
const ELEVEN_SUBSCRIPTION_URL = 'https://api.elevenlabs.io/v1/user/subscription';

export interface ElevenEnv {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** Resolve ElevenLabs config from process.env (call loadDotEnv() first). */
export function resolveElevenEnv(): ElevenEnv {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? '',
    modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_v3',
  };
}

// exported for unit tests (seed a fake cache entry / verify keying)
export function elevenCacheKey(text: string, env: ElevenEnv): string {
  return createHash('sha256')
    .update(`${env.voiceId}|${env.modelId}|${JSON.stringify(ELEVEN_SETTINGS)}|${text}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

function elevenCachePaths(key: string): { audio: string; words: string } {
  return {
    audio: join(ELEVEN_CACHE_DIR, `${key}.mp3`),
    words: join(ELEVEN_CACHE_DIR, `${key}.words.json`),
  };
}

/** True if this exact chunk is already cached (→ 0 credits to re-synthesize).
 *  Used by the pre-flight quota gate to count only chars that WILL be billed. */
export function elevenCacheHas(text: string, env: ElevenEnv = resolveElevenEnv()): boolean {
  const { audio, words } = elevenCachePaths(elevenCacheKey(text, env));
  return existsSync(audio) && existsSync(words);
}

/** Remaining ElevenLabs character quota, or null if it can't be read (offline,
 *  401…). Caller treats null as "unknown" and proceeds (the API call itself
 *  still FAILs honestly if quota is actually exhausted). */
export async function elevenQuotaRemaining(apiKey: string): Promise<number | null> {
  try {
    const r = await fetch(ELEVEN_SUBSCRIPTION_URL, { headers: { 'xi-api-key': apiKey } });
    if (!r.ok) return null;
    const j = (await r.json()) as { character_count?: number; character_limit?: number };
    if (typeof j.character_count !== 'number' || typeof j.character_limit !== 'number') return null;
    return j.character_limit - j.character_count;
  } catch {
    return null;
  }
}

/** Convert ElevenLabs char-level alignment → edge-style word boundaries, so the
 *  existing step-12 caption/timing path (lineAlign, audioDur) works unchanged.
 *  Words are split on whitespace; each word's offset = first char start, its
 *  duration = last char end − first char start (all chunk-relative). */
// exported for unit tests (verify char→word grouping without hitting the API)
export function charAlignToWords(a: CharAlignment): EdgeWord[] {
  const words: EdgeWord[] = [];
  let text = '';
  let start = 0;
  let end = 0;
  let started = false;
  const flush = (): void => {
    if (text.length > 0) {
      words.push({ text, offsetSec: start, durationSec: Math.max(0, end - start) });
    }
    text = '';
    started = false;
  };
  const n = Math.min(
    a.characters.length,
    a.character_start_times_seconds.length,
    a.character_end_times_seconds.length,
  );
  for (let i = 0; i < n; i += 1) {
    const ch = a.characters[i];
    const s = a.character_start_times_seconds[i];
    const e = a.character_end_times_seconds[i];
    if (ch === undefined || s === undefined || e === undefined) continue;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (!started) {
      start = s;
      started = true;
    }
    text += ch;
    end = e;
  }
  flush();
  return words;
}

/** Synthesize one Vietnamese chunk via ElevenLabs /with-timestamps. Writes
 *  outAudio (mp3) + outWords (edge-shaped) and returns word boundaries — same
 *  contract as synthEdge. Cache hit ⇒ no API call (0 credits). On API error it
 *  THROWS (FAIL honest) — no fallback to edge (never a two-voice video). */
export async function synthEleven(opts: {
  text: string;
  outAudio: string;
  outWords: string;
}): Promise<EdgeWord[]> {
  const env = resolveElevenEnv();
  if (!env.apiKey || !env.voiceId) {
    throw new Error(
      'ELEVENLABS_ENV_MISSING: cần ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID trong .env',
    );
  }
  const key = elevenCacheKey(opts.text, env);
  const cache = elevenCachePaths(key);

  // (1) cache hit → 0 credits
  if (existsSync(cache.audio) && existsSync(cache.words)) {
    copyFileSync(cache.audio, opts.outAudio);
    const cachedWords = JSON.parse(readFileSync(cache.words, 'utf8')) as EdgeWord[];
    writeFileSync(opts.outWords, JSON.stringify({ words: cachedWords }), 'utf8');
    return cachedWords;
  }

  // (2) miss → bill one synth, then persist to cache
  const client = new ElevenLabsClient({
    apiKey: env.apiKey,
    voiceId: env.voiceId,
    modelId: env.modelId,
  });
  const res = await client.generateWithTimestamps(opts.text, ELEVEN_SETTINGS, opts.outAudio);
  const words = charAlignToWords(res.normalized_alignment);
  writeFileSync(opts.outWords, JSON.stringify({ words }), 'utf8');

  mkdirSync(ELEVEN_CACHE_DIR, { recursive: true });
  copyFileSync(opts.outAudio, cache.audio);
  writeFileSync(cache.words, JSON.stringify(words), 'utf8');
  return words;
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
