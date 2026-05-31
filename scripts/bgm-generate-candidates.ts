/**
 * VFOS BGM Candidate Generator — Round 51B.
 *
 * Generates REAL instrumental BGM candidates via the ElevenLabs Music API
 * (`/v1/music`, the endpoint proven in Phần 3b). Candidates are written to a
 * gitignored runtime folder for Operator review BEFORE they are promoted into
 * the official library at production/fixtures/bgm/.
 *
 * Unlike the legacy scripts/bgm-generator-demo.ts (Round P28) which only writes
 * MOCK text placeholders and never actually calls the API, this script makes a
 * genuine API call and validates the resulting audio with ffprobe.
 *
 * Safety:
 *   - NEVER calls the API without --confirm-api-call (default = dry-run plan).
 *   - Hard cap of 20 tracks total; --limit <n> further restricts a run.
 *   - Never logs the API key (only "key detected: yes/no").
 *   - Writes only to data/temp/bgm_candidates/ (gitignored). No git mutation.
 *   - No publish, no upload, no social API.
 *
 * Usage:
 *   tsx scripts/bgm-generate-candidates.ts                       # dry-run plan
 *   tsx scripts/bgm-generate-candidates.ts --limit 1 --confirm-api-call
 *   tsx scripts/bgm-generate-candidates.ts --confirm-api-call    # all missing (<=20)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../packages/voice/src/load-env.js';

const HARD_CAP = 20;
const CANDIDATES_DIR = 'data/temp/bgm_candidates';
const REPORT_PATH = join(CANDIDATES_DIR, 'bgm_generation_report.json');
const MUSIC_ENDPOINT = 'https://api.elevenlabs.io/v1/music';
const MUSIC_LENGTH_MS = 60_000; // 60s — within the 45–70s target window.

interface TrackPlan {
  trackId: string;
  fileName: string;
  title: string;
  mood: string;
  prompt: string;
}

// Shared base — every track is instrumental, loopable, and sits under voice.
const BASE_PROMPT =
  'Create a 60-second instrumental background music track for short-form product review videos on TikTok/Reels. ' +
  'No vocals, no lyrics, no human voice. Keep it light, loopable, clean, upbeat but not aggressive, suitable under Vietnamese voiceover. ' +
  'Avoid heavy bass, loud drops, sudden impacts, or distracting melodies. Designed for affiliate product review, gadget/lifestyle/ecommerce content.';

// Per-track mood detail so the 20 tracks share a purpose but differ in colour.
// [trackNumber, title, moodGroup, distinct mood detail]
const TRACK_SPECS: Array<[number, string, string, string]> = [
  // Nhóm 1 — Upbeat Gadget Review
  [
    1,
    'Bright Gadget Bounce',
    'upbeat_review',
    'bright bouncy pop, playful claps, medium tempo, cheerful gadget unboxing energy.',
  ],
  [
    2,
    'Fresh Shopping Pop',
    'upbeat_review',
    'fresh poppy synth plucks, light four-on-the-floor, breezy shopping vibe.',
  ],
  [
    3,
    'Sunny Product Demo',
    'upbeat_review',
    'sunny ukulele-style plucks and soft bells, warm friendly product demo feel.',
  ],
  [
    4,
    'Light Review Groove',
    'upbeat_review',
    'light clean guitar groove, gentle finger snaps, easygoing walkthrough.',
  ],
  [
    5,
    'Cute Deal Energy',
    'upbeat_review',
    'cute marimba and glockenspiel, perky but soft, fun deal-announcement mood.',
  ],
  // Nhóm 2 — Bright Chill Lifestyle / Shopping (regenerated Round 51B patch:
  // operator rejected the original sleepy/sad lo-fi takes — steer brighter).
  [
    6,
    'Bright Chill Shopping',
    'lofi_lifestyle',
    'bright chill lifestyle shopping, light upbeat lo-fi pop, warm but NOT sleepy, clean drums, soft plucks and keys, gentle bounce, happy shopping energy; avoid sad, dark or lounge-cafe mood.',
  ],
  [
    7,
    'Warm Home Review Pop',
    'lofi_lifestyle',
    'warm home review pop, light lo-fi with friendly groove, bright and cheerful, soft keys, gentle beat; not sleepy, not sad, not dark lounge.',
  ],
  [
    8,
    'Soft Bounce Lifestyle',
    'lofi_lifestyle',
    'soft bouncy lifestyle groove, light upbeat lo-fi, clean drums, playful plucks, warm and friendly; not sleepy, not melancholic.',
  ],
  [
    9,
    'Friendly Product Flow',
    'lofi_lifestyle',
    'friendly product flow, bright chill pop with light bounce, soft warm keys, easy positive energy; not sleepy, not dark, not sad.',
  ],
  [
    10,
    'Clean Cozy Review Beat',
    'lofi_lifestyle',
    'clean cozy review beat, warm lo-fi pop, gentle upbeat rhythm, bright and inviting; not sleepy, not lounge-sad.',
  ],
  // Nhóm 3 — Funky TikTok Review
  [
    11,
    'Funky Mini Review',
    'funky_tiktok',
    'light funky bass and clipped guitar, snappy but soft groove.',
  ],
  [
    12,
    'Playful Deal Walk',
    'funky_tiktok',
    'playful funk strut, finger snaps, bouncy walking tempo.',
  ],
  [
    13,
    'Bounce Product Hook',
    'funky_tiktok',
    'bouncy syncopated groove, punchy yet light, hook-friendly.',
  ],
  [
    14,
    'Happy Scroll Stopper',
    'funky_tiktok',
    'happy upbeat funk, bright stabs, attention-grabbing but gentle.',
  ],
  [15, 'Groovy Review Pop', 'funky_tiktok', 'groovy pop-funk, warm bass, feel-good mid tempo.'],
  // Nhóm 4 — Clean Tech / Modern Product
  [
    16,
    'Clean Tech Pulse',
    'clean_tech',
    'clean minimal electronic pulse, soft arpeggios, modern sheen.',
  ],
  [
    17,
    'Bright Tech Review Pulse',
    'clean_tech',
    'modern clean tech with friendly energy, bright light electronic pulse, crisp synth plucks, subtle groove, polished but not cold; not boring corporate, no aggressive EDM drop.',
  ],
  [
    18,
    'Friendly Digital Product Beat',
    'clean_tech',
    'friendly digital product beat, modern clean electronic, bright synths, light upbeat pulse, warm and polished; not cold, not corporate-stiff, no harsh drop.',
  ],
  [
    19,
    'Smooth Ecom Motion',
    'clean_tech',
    'smooth flowing electronic, gentle motion, polished ecommerce feel.',
  ],
  [
    20,
    'Fresh Digital Review',
    'clean_tech',
    'fresh bright digital synths, crisp light percussion, upbeat and clean.',
  ],
];

const TRACK_PLAN: TrackPlan[] = TRACK_SPECS.map(([n, title, mood, detail]) => {
  const id = String(n).padStart(3, '0');
  return {
    trackId: `bgm_${id}`,
    fileName: `bgm_${id}.mp3`,
    title,
    mood,
    prompt: `${BASE_PROMPT} Mood: ${detail}`,
  };
});

function ffprobe(filePath: string): { durationSec: number; codec: string | null; ok: boolean } {
  const res = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name:format=duration',
      '-of',
      'json',
      filePath,
    ],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) return { durationSec: 0, codec: null, ok: false };
  try {
    const data = JSON.parse(res.stdout);
    const codec = data.streams?.[0]?.codec_name ?? null;
    const durationSec = Number.parseFloat(data.format?.duration ?? '0');
    return { durationSec, codec, ok: Boolean(codec) && durationSec > 0 };
  } catch {
    return { durationSec: 0, codec: null, ok: false };
  }
}

async function generateOne(
  plan: TrackPlan,
  apiKey: string,
  outDir: string,
): Promise<{
  ok: boolean;
  filePath: string;
  httpStatus: number;
  bytes: number;
  errorSnippet?: string;
}> {
  const filePath = join(outDir, plan.fileName);
  let res: Response;
  try {
    res = await fetch(MUSIC_ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: plan.prompt, music_length_ms: MUSIC_LENGTH_MS }),
    });
  } catch (err) {
    return {
      ok: false,
      filePath,
      httpStatus: 0,
      bytes: 0,
      errorSnippet: `network error: ${(err as Error).message}`,
    };
  }

  if (!res.ok) {
    let snippet = '';
    try {
      snippet = (await res.text()).slice(0, 300);
    } catch {
      snippet = '(no body)';
    }
    return { ok: false, filePath, httpStatus: res.status, bytes: 0, errorSnippet: snippet };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, buf);
  return { ok: true, filePath, httpStatus: res.status, bytes: buf.length };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'confirm-api-call': { type: 'boolean', default: false },
      limit: { type: 'string' },
      only: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const confirm = Boolean(values['confirm-api-call']);
  const limit = values.limit ? Math.max(0, Number.parseInt(values.limit as string, 10)) : 0;
  // --only bgm_006,bgm_007 → regenerate exactly those tracks (overwrite existing).
  const onlySet = values.only
    ? new Set(
        (values.only as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  console.log('======================================================');
  console.log('🎵  VFOS BGM Candidate Generator (Round 51B)');
  console.log('======================================================');
  console.log(`Endpoint:        ${MUSIC_ENDPOINT}`);
  console.log(`Track length:    ${MUSIC_LENGTH_MS / 1000}s`);
  console.log(`Hard cap:        ${HARD_CAP} tracks total`);
  console.log(`Output (runtime):${CANDIDATES_DIR}/ (gitignored)`);

  const outDir = resolve(CANDIDATES_DIR);
  mkdirSync(outDir, { recursive: true });

  // Queue selection:
  //   --only <ids>  → exactly those tracks, overwriting existing files (regenerate).
  //   default       → tracks not yet present (fresh generation).
  const missing = TRACK_PLAN.filter((t) => !existsSync(join(outDir, t.fileName)));
  let queue: TrackPlan[];
  if (onlySet) {
    queue = TRACK_PLAN.filter((t) => onlySet.has(t.trackId));
    const unknown = [...onlySet].filter((id) => !TRACK_PLAN.some((t) => t.trackId === id));
    if (unknown.length) console.log(`⚠️  Unknown trackIds ignored: ${unknown.join(', ')}`);
  } else {
    queue = missing;
  }
  if (limit > 0) queue = queue.slice(0, limit);
  // Enforce the absolute hard cap defensively.
  queue = queue.slice(0, HARD_CAP);

  console.log(`Plan total:      ${TRACK_PLAN.length}`);
  console.log(`Already present: ${TRACK_PLAN.length - missing.length}`);
  console.log(
    `Mode:            ${onlySet ? `REGENERATE --only (${queue.length} track)` : 'fresh-missing'}`,
  );
  console.log(`This run queue:  ${queue.length}${limit > 0 ? ` (limited to ${limit})` : ''}`);
  console.log('------------------------------------------------------');

  if (!confirm || values['dry-run']) {
    console.log('\n🔍 DRY-RUN (no --confirm-api-call) — plan only, no API calls, no .env read:');
    for (const t of queue) {
      console.log(`  ${t.trackId}  [${t.mood}]  "${t.title}"  -> ${t.fileName}`);
    }
    console.log(
      '\nTo generate for real, rerun with --confirm-api-call (and optional --limit <n>).',
    );
    process.exit(0);
  }

  // Live path only: read .env now (never during dry-run).
  loadDotEnv();
  const apiKey = process.env.ELEVENLABS_API_KEY || '';
  console.log(`API key detected: ${apiKey ? 'YES' : 'NO'}`);

  if (!apiKey) {
    console.log('\n🛑 BGM_GENERATOR_NOT_CONFIGURED: ELEVENLABS_API_KEY not set.');
    console.log('Operator must provide the API key or supply mp3 files manually.');
    process.exit(3);
  }

  const results: Array<Record<string, unknown>> = [];
  let okCount = 0;
  for (let i = 0; i < queue.length; i++) {
    const plan = queue[i];
    console.log(
      `\n[${i + 1}/${queue.length}] Generating ${plan.trackId} "${plan.title}" (${plan.mood})…`,
    );
    const gen = await generateOne(plan, apiKey, outDir);
    if (!gen.ok) {
      console.log(`  🛑 FAILED (HTTP ${gen.httpStatus}). ${gen.errorSnippet ?? ''}`);
      results.push({
        trackId: plan.trackId,
        fileName: plan.fileName,
        ok: false,
        httpStatus: gen.httpStatus,
        errorSnippet: gen.errorSnippet,
      });
      continue;
    }
    const probe = ffprobe(gen.filePath);
    const durationOk = probe.durationSec >= 30 && probe.durationSec <= 90;
    console.log(
      `  ✅ saved ${gen.bytes} bytes — ${probe.durationSec.toFixed(1)}s, codec=${probe.codec}, audioValid=${probe.ok}, durationInRange=${durationOk}`,
    );
    if (probe.ok) okCount++;
    results.push({
      trackId: plan.trackId,
      fileName: plan.fileName,
      title: plan.title,
      mood: plan.mood,
      ok: probe.ok,
      bytes: gen.bytes,
      durationSec: probe.durationSec,
      codec: probe.codec,
      durationInRange: durationOk,
      localPath: `${CANDIDATES_DIR}/${plan.fileName}`,
    });
  }

  const report = {
    bgmGenerationVersion: 'v1',
    generatedAt: new Date().toISOString(),
    endpoint: MUSIC_ENDPOINT,
    musicLengthMs: MUSIC_LENGTH_MS,
    requested: queue.length,
    succeeded: okCount,
    failed: queue.length - okCount,
    note: 'ElevenLabs Music API instrumental candidates. PENDING_OPERATOR_REVIEW. Verify ElevenLabs commercial usage terms before publishing affiliate videos.',
    tracks: results,
  };
  writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Succeeded: ${okCount}/${queue.length}`);
  process.exit(okCount === queue.length ? 0 : 4);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
