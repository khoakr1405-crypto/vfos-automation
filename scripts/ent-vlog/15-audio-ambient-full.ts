// E1 step 15 — apply the A+ AMBIENT audio policy to the FULL video.
// Reuses the PASS visual base montage_v2_short.mp4 (caption already baked) + the
// exact VO montage_vo.mp3 it is synced to. ONLY the audio BED changes:
//   1. extract the ORIGINAL audio of the same 5 montage windows → concat
//   2. Demucs --two-stems=vocals → keep `no_vocals` (Chinese speech removed,
//      sea/wind/water/handling kept)
//   3. mix ambient(0.8, sidechain-ducked by VO) + VO, NO BGM
//   4. mux onto the existing video stream (caption/VO untouched → sync holds)
// No visual/caption re-render, no publish, no Review, no commit. Local only.
//   pnpm tsx scripts/ent-vlog/15-audio-ambient-full.ts --id ent_squid_001
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readAnchorPlan } from './lib/anchors.js';
import { workDir } from './lib/env.js';

const AMBIENT_VOL = 0.8;
// -20% âm lượng tiếng nói (operator: "tiếng nói to quá"). Chỉ giảm VO ở nhánh
// được MIX (vom); sidechain key (vok) giữ mức gốc nên độ ducking ambient không đổi.
const VO_VOL = 0.8;
const DUCK = 'threshold=0.06:ratio=6:attack=15:release=350';
const DEMUCS_PY = resolve('tools/demucs-sep/.venv/Scripts/python.exe');

function sh(cmd: string, args: string[], label: string): boolean {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) {
    console.error(`⚠️ ${label} (exit ${r.status ?? 'null'})`);
    console.error((r.stderr ?? '').slice(-700));
    return false;
  }
  return true;
}

function measureDb(path: string): { mean: number; max: number } {
  const r = spawnSync('ffmpeg', ['-i', path, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const err = r.stderr ?? '';
  const mm = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const xm = err.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    mean: mm && mm[1] != null ? Number(mm[1]) : Number.NaN,
    max: xm && xm[1] != null ? Number(xm[1]) : Number.NaN,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  if (!existsSync(DEMUCS_PY)) {
    console.error('🛑 DEMUCS_VENV_MISSING — cài tools/demucs-sep trước.');
    process.exit(2);
  }
  const dir = workDir(id);
  const clipDir = join(dir, 'montage_v2');
  const src = join(dir, 'source.mp4');
  const baseVideo = join(dir, 'montage_v2_short.mp4'); // PASS visual (caption baked)
  const voPath = join(clipDir, 'montage_vo.mp3'); // VO synced to that caption
  for (const [p, name] of [
    [baseVideo, 'montage_v2_short.mp4'],
    [voPath, 'montage_vo.mp3'],
  ] as const) {
    if (!existsSync(p)) {
      console.error(`🛑 MISSING ${name} — chạy step 12 (bản 52 cụm PASS) trước.`);
      process.exit(2);
    }
  }
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    durationSec: number;
  };
  const ad = join(dir, 'audio_proof');
  mkdirSync(ad, { recursive: true });

  // 1) Source windows = ĐÚNG anchors của montage (anchors.json, dùng chung với 10)
  // → trích + nối audio gốc. KHÔNG hardcode để audio không lệch video.
  const plan = readAnchorPlan(dir);
  console.log(`[15] Anchors (${plan.source}): ${plan.anchors.map((a) => a.toFixed(1)).join(', ')}`);
  let running = 0;
  const segs = [...plan.anchors]
    .sort((a, b) => a - b)
    .map((tSec) => {
      const s = Math.max(0, tSec - plan.lead);
      const e = Math.min(meta.durationSec, tSec + plan.reaction);
      running += e - s;
      return { s, dur: Number((e - s).toFixed(3)) };
    });
  const montageTotal = Number(running.toFixed(2));
  const ambientRaw = join(ad, 'montage_ambient_raw.wav');
  const inputs: string[] = [];
  const labels: string[] = [];
  for (const [i, seg] of segs.entries()) {
    inputs.push('-ss', String(seg.s), '-t', String(seg.dur), '-i', src);
    labels.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
  }
  const concat = `${labels.join(';')};${segs.map((_, i) => `[a${i}]`).join('')}concat=n=${segs.length}:v=0:a=1[out]`;
  console.log(`[15] Trích + concat audio gốc ${segs.length} cửa sổ (${montageTotal}s)…`);
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        ...inputs,
        '-filter_complex',
        concat,
        '-map',
        '[out]',
        '-ar',
        '44100',
        '-ac',
        '2',
        ambientRaw,
      ],
      'AMBIENT_CONCAT',
    )
  )
    process.exit(3);

  // 2) Demucs → no_vocals (Chinese speech removed, ambient kept).
  const sepDir = join(ad, 'demucs_full');
  console.log('[15] Demucs htdemucs --two-stems=vocals (CPU)…');
  if (
    !sh(
      DEMUCS_PY,
      [
        '-m',
        'demucs',
        '--two-stems=vocals',
        '-n',
        'htdemucs',
        '-d',
        'cpu',
        '-o',
        sepDir,
        ambientRaw,
      ],
      'DEMUCS',
    )
  )
    process.exit(4);
  const noVocals = join(sepDir, 'htdemucs', 'montage_ambient_raw', 'no_vocals.wav');
  const vocals = join(sepDir, 'htdemucs', 'montage_ambient_raw', 'vocals.wav');
  if (!existsSync(noVocals)) {
    console.error('🛑 DEMUCS_NO_OUTPUT');
    process.exit(4);
  }

  // 3) Mix ambient(0.8, sidechain-ducked by VO) + VO. No BGM.
  const finalAudio = join(ad, 'montage_v2_ambient_audio.wav');
  const mixFilter = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[vok][vom];[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${AMBIENT_VOL}[amb];[amb][vok]sidechaincompress=${DUCK}[ambd];[vom]volume=${VO_VOL}[vomq];[ambd][vomq]amix=inputs=2:normalize=0:dropout_transition=0[out]`;
  console.log('[15] Mix ambient(ducked) + VO (no BGM)…');
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        '-i',
        noVocals,
        '-i',
        voPath,
        '-filter_complex',
        mixFilter,
        '-map',
        '[out]',
        '-t',
        String(montageTotal),
        '-ar',
        '44100',
        '-ac',
        '2',
        finalAudio,
      ],
      'MIX',
    )
  )
    process.exit(5);

  // 4) Mux onto the existing PASS video (caption/VO untouched).
  const out = join(dir, 'montage_v2_short_ambient.mp4');
  console.log('[15] Mux audio mới lên video PASS (caption giữ nguyên)…');
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        '-i',
        baseVideo,
        '-i',
        finalAudio,
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-shortest',
        out,
      ],
      'MUX',
    )
  )
    process.exit(6);

  // 5) QA.
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', out],
    { encoding: 'utf8' },
  );
  let outDur = 0;
  let hasAudio = false;
  try {
    const j = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    outDur = Number.parseFloat(j.format?.duration ?? '0');
    hasAudio = (j.streams ?? []).some((s) => s.codec_type === 'audio');
  } catch {
    /* ignore */
  }
  const ambDb = measureDb(noVocals);
  const vocDb = measureDb(vocals);
  const voDb = measureDb(voPath);
  const finDb = measureDb(finalAudio);
  const voiceAboveAmbientDb = Number((voDb.max - ambDb.max).toFixed(1));

  // Audio report (data contract §4 `audio`) — UI chứng minh policy đã áp.
  writeFileSync(
    join(clipDir, 'montage_v2_audio_report.json'),
    JSON.stringify(
      {
        audioMode: 'remove_speech_keep_ambient',
        demucs: 'htdemucs/ok',
        ambientLevel: AMBIENT_VOL,
        ducking: DUCK,
        bgm: 'none',
        fallbackUsed: null,
        output: 'montage_v2_short_ambient.mp4',
        durationSec: Number(outDur.toFixed(1)),
        montageTotalSec: montageTotal,
        hasAudio,
        loudness: {
          vocalsRemovedMaxDb: vocDb.max,
          ambientKeptMaxDb: ambDb.max,
          voMaxDb: voDb.max,
          finalMixMaxDb: finDb.max,
        },
        voiceAboveAmbientDb,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log('======================================================');
  console.log('[15] ✅ A+ ambient FULL — chỉ thay audio bed, caption/VO giữ nguyên.');
  console.log(`   OUTPUT: ${out}`);
  console.log(
    `   dur ${outDur.toFixed(1)}s / montage ${montageTotal}s | audio ${hasAudio ? '✅' : '❌'}`,
  );
  console.log(
    `   ambient level ${AMBIENT_VOL} | VO level ${VO_VOL} (-20%) | ducking ${DUCK} | BGM: none`,
  );
  console.log('   --- loudness (mean/max dB) ---');
  console.log(`   vocals removed (giọng tách): ${vocDb.mean}/${vocDb.max}`);
  console.log(`   no_vocals (ambient giữ)    : ${ambDb.mean}/${ambDb.max}`);
  console.log(`   VO                         : ${voDb.mean}/${voDb.max}`);
  console.log(`   final mix                  : ${finDb.mean}/${finDb.max}`);
  console.log(
    `   VO đỉnh > ambient đỉnh?    : ${voDb.max > ambDb.max ? `✅ (+${(voDb.max - ambDb.max).toFixed(1)}dB)` : '⚠️ kiểm tra'}`,
  );
  console.log('======================================================');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
