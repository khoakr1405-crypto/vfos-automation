// E1 — AUDIO A/B PROOF for the entertainment lane (20–30s only, NO full render).
// Compares two ambient policies under the same Vietnamese VO:
//   A) Demucs `--two-stems=vocals` → keep `no_vocals` stem = REAL ambient
//      (sea/wind/water/handling) with the Chinese SPEECH removed.
//   B) Original muted + SYNTHETIC stock sea/wind ambient (ffmpeg lavfi).
// Local only. No publish, no TikTok, no Product Review, no registry, no commit.
//   pnpm tsx scripts/ent-vlog/14-audio-proof.ts --id ent_squid_001
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';
import { EDGE_MALE_VOICE, synthesizeChunk } from './lib/tts-provider.js';

const CLIP_START = 122.5; // source seconds (montage seg1 window)
const CLIP_DUR = 23;
const MONTAGE_OFFSET = 12.5; // seg1 montageStart → proofTime = montageTime - offset
const DEMUCS_PY = resolve('tools/demucs-sep/.venv/Scripts/python.exe');

interface Beat {
  role: string;
  text: string;
  montageTime: number;
}

function sh(cmd: string, args: string[], label: string, useShell = false): boolean {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: useShell, stdio: 'pipe' });
  if (r.status !== 0) {
    console.error(`⚠️ ${label} (exit ${r.status ?? 'null'})`);
    console.error((r.stderr ?? '').slice(-600));
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

function mux(video: string, audio: string, out: string, label: string): boolean {
  return sh(
    'ffmpeg',
    ['-y', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out],
    label,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const dir = workDir(id);
  const pd = join(dir, 'audio_proof');
  mkdirSync(pd, { recursive: true });
  const src = join(dir, 'source.mp4');
  const clipVideo = join(pd, 'clip_video.mp4');
  const clipAudio = join(pd, 'clip_audio.wav');

  // 0) Cut clip (video + original audio) if not already present.
  if (!existsSync(clipVideo))
    sh('ffmpeg', ['-y', '-ss', String(CLIP_START), '-i', src, '-t', String(CLIP_DUR), '-an', '-r', '30', '-vf', 'scale=720:1280', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', clipVideo], 'CUT_VIDEO');
  if (!existsSync(clipAudio))
    sh('ffmpeg', ['-y', '-ss', String(CLIP_START), '-i', src, '-t', String(CLIP_DUR), '-vn', '-ac', '2', '-ar', '44100', clipAudio], 'CUT_AUDIO');

  // 1) VN VO for this clip — reuse the approved seg1 chunks, re-timed to proof.
  const script = JSON.parse(readFileSync(join(dir, 'montage_v2', 'montage_v2_script.json'), 'utf8')) as {
    beats: Beat[];
  };
  const lines = script.beats
    .filter((b) => b.montageTime >= MONTAGE_OFFSET && b.montageTime < MONTAGE_OFFSET + CLIP_DUR)
    .map((b) => ({ text: b.text, t: Number((b.montageTime - MONTAGE_OFFSET).toFixed(2)) }))
    .sort((a, b) => a.t - b.t);
  console.log(`[proof] VO ${lines.length} câu Việt cho clip ${CLIP_DUR}s…`);
  const tmp = join(pd, '_tts');
  mkdirSync(tmp, { recursive: true });
  const voMp3: string[] = [];
  const delays: number[] = [];
  for (const [i, l] of lines.entries()) {
    const outAudio = join(tmp, `vo_${String(i).padStart(2, '0')}.mp3`);
    synthesizeChunk('edge', { text: l.text, voice: EDGE_MALE_VOICE, outAudio, outWords: `${outAudio}.words.json` });
    if (existsSync(outAudio)) {
      voMp3.push(outAudio);
      delays.push(Math.round(l.t * 1000));
    }
  }
  const voOut = join(pd, 'proof_vo.wav');
  const voFilter =
    voMp3.length === 1
      ? `[0:a]adelay=${delays[0]}:all=1,apad[out]`
      : `${voMp3.map((_, i) => `[${i}:a]adelay=${delays[i]}:all=1[a${i}]`).join(';')};${voMp3.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voMp3.length}:normalize=0:dropout_transition=0,apad[out]`;
  sh('ffmpeg', ['-y', ...voMp3.flatMap((p) => ['-i', p]), '-filter_complex', voFilter, '-map', '[out]', '-t', String(CLIP_DUR), '-ar', '44100', '-ac', '2', voOut], 'VO_MIX');

  // 2) SYNTHETIC stock sea/wind ambient (for B). brown noise = sea swell,
  //    pink = wind hiss; slow tremolo = wave motion.
  const stock = join(pd, 'stock_ambient.wav');
  sh(
    'ffmpeg',
    ['-y', '-filter_complex', `anoisesrc=color=brown:amplitude=0.6:duration=${CLIP_DUR},highpass=f=55,lowpass=f=1600,tremolo=f=0.1:d=0.7[sea];anoisesrc=color=pink:amplitude=0.22:duration=${CLIP_DUR},highpass=f=500,lowpass=f=7000,tremolo=f=0.12:d=0.5[wind];[sea][wind]amix=inputs=2:normalize=0[m];[m]aformat=channel_layouts=stereo[out]`, '-map', '[out]', '-t', String(CLIP_DUR), '-ar', '44100', stock],
    'STOCK_AMBIENT',
  );

  // 3) Proof A — Demucs no_vocals (if available).
  const sepDir = join(pd, 'demucs_out');
  let aOk = false;
  let noVocals = '';
  let vocals = '';
  if (existsSync(DEMUCS_PY)) {
    console.log('[proof] Demucs htdemucs --two-stems=vocals (CPU)…');
    const ran = sh(DEMUCS_PY, ['-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-d', 'cpu', '-o', sepDir, clipAudio], 'DEMUCS');
    noVocals = join(sepDir, 'htdemucs', 'clip_audio', 'no_vocals.wav');
    vocals = join(sepDir, 'htdemucs', 'clip_audio', 'vocals.wav');
    aOk = ran && existsSync(noVocals);
  } else {
    console.log('[proof] ⚠️ Demucs venv chưa có — bỏ qua bản A.');
  }

  const proofA = join(pd, 'proof_A.mp4');
  if (aOk) {
    const mixA = join(pd, 'mixA.wav');
    sh('ffmpeg', ['-y', '-i', noVocals, '-i', voOut, '-filter_complex', '[0:a]volume=0.55[amb];[1:a]volume=1.0[vo];[amb][vo]amix=inputs=2:normalize=0:dropout_transition=0[out]', '-map', '[out]', '-t', String(CLIP_DUR), '-ar', '44100', '-ac', '2', mixA], 'MIX_A');
    mux(clipVideo, mixA, proofA, 'MUX_A');
  }

  // 4) Proof B — stock ambient + VO.
  const proofB = join(pd, 'proof_B.mp4');
  const mixB = join(pd, 'mixB.wav');
  sh('ffmpeg', ['-y', '-i', stock, '-i', voOut, '-filter_complex', '[0:a]volume=0.5[amb];[1:a]volume=1.0[vo];[amb][vo]amix=inputs=2:normalize=0:dropout_transition=0[out]', '-map', '[out]', '-t', String(CLIP_DUR), '-ar', '44100', '-ac', '2', mixB], 'MIX_B');
  mux(clipVideo, mixB, proofB, 'MUX_B');

  // 5) QA loudness proxies (final ear-check is the operator's).
  const origDb = measureDb(clipAudio);
  const voDb = measureDb(voOut);
  const stockDb = measureDb(stock);
  const vocDb = aOk ? measureDb(vocals) : { mean: Number.NaN, max: Number.NaN };
  const ambDb = aOk ? measureDb(noVocals) : { mean: Number.NaN, max: Number.NaN };

  console.log('======================================================');
  console.log('[proof] AUDIO A/B done (20–30s, no full render).');
  console.log(`  clip: ${clipVideo}`);
  console.log(`  A (Demucs ambient): ${aOk ? proofA : 'SKIPPED (demucs unavailable/fail)'}`);
  console.log(`  B (stock ambient)  : ${proofB}`);
  console.log('  --- loudness (mean/max dB) ---');
  console.log(`  original clip : ${origDb.mean}/${origDb.max}`);
  if (aOk) console.log(`  vocals removed: ${vocDb.mean}/${vocDb.max}   (giọng đã tách ra)`);
  if (aOk) console.log(`  no_vocals kept: ${ambDb.mean}/${ambDb.max}   (ambient giữ lại)`);
  console.log(`  stock ambient : ${stockDb.mean}/${stockDb.max}`);
  console.log(`  VN voice      : ${voDb.mean}/${voDb.max}`);
  console.log('======================================================');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
