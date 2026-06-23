// E1b step 07 — assemble the sample short by REUSING the real Review modules
// (subtitle scrub + offline-render-video + kinetic caption), NOT a hand-rolled
// ffmpeg pipeline. Voice = the per-segment timed VO from step 05 (source-timed,
// right for reup). Output quality = Review-grade (scrub + voice + BGM + render).
//
// ISOLATION (operator-required): nothing is written under data/temp/jobs/ (the
// Review job list/registry), and the shared BGM rotation library is read
// READ-ONLY (no usageCount mutation). All artifacts live under data/temp/ent/.
//
//   pnpm tsx scripts/ent-vlog/07-render-real.ts --id ent_squid_001 --clip clip_1
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';

const BGM_LIBRARY = 'production/_media/bgm_library.json';

interface BgmEntry {
  trackId?: string;
  id?: string;
  title?: string;
  mood?: string;
  path?: string;
  localAudioPath?: string;
}

/** Read-only BGM pick — NEVER writes the shared library (no rotation mutation). */
function pickBgmReadOnly(): {
  selected: true;
  trackId: string;
  title: string;
  mood: string;
  localAudioPath: string;
  volumeMultiplier: number;
} | null {
  const abs = resolve(BGM_LIBRARY);
  if (!existsSync(abs)) return null;
  const lib = JSON.parse(readFileSync(abs, 'utf8')) as { entries?: BgmEntry[] };
  const entries = Array.isArray(lib.entries) ? lib.entries : [];
  const withFile = entries
    .map((e) => ({ e, p: e.localAudioPath ?? e.path ?? null }))
    .filter((x): x is { e: BgmEntry; p: string } => !!x.p && existsSync(resolve(x.p)));
  if (withFile.length === 0) return null;
  // Prefer an outdoor/energetic mood if present; else first available. Deterministic,
  // read-only — does NOT consult or bump usageCount.
  const preferred =
    withFile.find((x) => /lofi|lifestyle|funky|tiktok|upbeat|outdoor/i.test(x.e.mood ?? '')) ??
    withFile[0];
  const e = preferred.e;
  return {
    selected: true,
    trackId: e.trackId ?? e.id ?? 'bgm_unknown',
    title: e.title ?? e.trackId ?? 'bgm',
    mood: e.mood ?? 'unknown',
    localAudioPath: resolve(preferred.p),
    volumeMultiplier: 0.4,
  };
}

function sh(cmd: string, args: string[], label: string, useShell = false): boolean {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: useShell, stdio: 'pipe' });
  if (r.status !== 0) {
    console.error(`⚠️ ${label} (exit ${r.status ?? 'null'})`);
    console.error((r.stdout ?? '').slice(-500));
    console.error((r.stderr ?? '').slice(-700));
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, clip: { type: 'string' } },
    strict: true,
  });
  const id = values.id;
  const clipId = values.clip ?? 'clip_1';
  if (!id) {
    console.error('Usage: --id <slug> --clip <clipId>');
    process.exit(1);
  }
  const dir = workDir(id);
  const metaPath = join(dir, 'source_meta.json');
  const transPath = join(dir, `${clipId}_translation_vi.json`);
  const voPath = join(dir, `${clipId}_vo.mp3`);
  const timingPath = join(dir, `${clipId}_voice_timing_artifact.json`);
  for (const [p, name] of [
    [metaPath, 'source_meta.json (01)'],
    [transPath, `${clipId}_translation_vi.json (04)`],
    [voPath, `${clipId}_vo.mp3 (05)`],
    [timingPath, `${clipId}_voice_timing_artifact.json (05)`],
  ] as const) {
    if (!existsSync(p)) {
      console.error(`🛑 Thiếu ${name}.`);
      process.exit(1);
    }
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { path: string };
  const trans = JSON.parse(readFileSync(transPath, 'utf8')) as {
    startSec: number;
    durationSec: number;
  };

  // Isolated per-clip dirs (NEVER under data/temp/jobs/).
  const clipDir = join(dir, clipId);
  const renderDir = join(clipDir, 'render');
  mkdirSync(renderDir, { recursive: true });

  // 1) Cut the clip (video only; audio is supplied by the VO, matching Review).
  const clipMp4 = join(clipDir, 'source_clip.mp4');
  console.log(`[07] Cắt clip ${trans.startSec.toFixed(1)}s +${trans.durationSec.toFixed(1)}s…`);
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(trans.startSec),
        '-i',
        meta.path,
        '-t',
        String(trans.durationSec),
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        clipMp4,
      ],
      'CUT_FAILED',
    )
  ) {
    process.exit(2);
  }

  // 2) Scrub: detect Chinese on-screen subtitle bands (REAL module, explicit
  //    --input/--output → isolated, no JOBS_ROOT). Best-effort.
  const maskPath = join(clipDir, 'source_subtitle_mask.json');
  console.log('[07] Scrub detect chữ Hán (subtitle:detect, real module)…');
  const scrubOk = sh(
    'npx',
    // zone-top 0.0 → quét CJK TOÀN KHUNG (reup: sticker/chữ Hán có thể ở đỉnh,
    // không chỉ dải phụ đề đáy như nguồn Review). Khác Review (mặc định 0.45).
    [
      'tsx',
      'scripts/source-subtitle-detector.ts',
      '--input',
      clipMp4,
      '--output',
      maskPath,
      '--zone-top',
      '0.0',
      '--zone-bottom',
      '1.0',
    ],
    'SCRUB_DETECT_SKIPPED — render tiếp KHÔNG che',
    true,
  );

  // 3) BGM: read-only pick (no rotation mutation).
  const bgm = pickBgmReadOnly();
  if (bgm) console.log(`[07] BGM (read-only): ${bgm.trackId} "${bgm.title}" (${bgm.mood})`);
  else console.log('[07] ⚠ Không có file BGM → render voiceover-only.');

  // 4) Render via the REAL renderer (mixes voice + BGM, keeps native 720x1280).
  const renderManifest = {
    renderVersion: 'v1',
    jobId: `ent_${id}_${clipId}`,
    runId: `ent_${id}_${clipId}`,
    output: { expectedPreviewPath: join(renderDir, 'preview.mp4') },
    renderOptions: {
      estimatedDurationSec: Math.round(trans.durationSec),
      resolution: '720x1280',
      aspectRatio: '9:16',
    },
    assets: { bgm },
    generatedAt: new Date().toISOString(),
  };
  const renderManifestPath = join(renderDir, 'render_manifest.json');
  writeFileSync(renderManifestPath, JSON.stringify(renderManifest, null, 2));
  const previewArtifactPath = join(renderDir, 'preview_artifact.json');
  console.log('[07] Render (offline-render-video, real module, mix voice+BGM)…');
  if (
    !sh(
      'npx',
      [
        'tsx',
        'scripts/offline-render-video-demo.ts',
        '--render',
        renderManifestPath,
        '--output',
        previewArtifactPath,
        '--mode',
        'local-preview',
        '--input-video',
        clipMp4,
        '--input-audio',
        voPath,
      ],
      'RENDER_FAILED',
      true,
    )
  ) {
    process.exit(3);
  }
  const previewMp4 = join(renderDir, 'preview.mp4');
  if (!existsSync(previewMp4)) {
    console.error('🛑 RENDER_NO_OUTPUT (preview.mp4 không thấy).');
    process.exit(3);
  }

  // 5) Caption + scrub-burn via the REAL kinetic renderer (clean_sub + mask).
  const runId = `ent_${id}_${clipId}`;
  mkdirSync(resolve('data/temp/pipeline-p9-demo', runId), { recursive: true });
  const shortOut = join(dir, `${clipId}_short.mp4`);
  const capArgs = [
    'tsx',
    'scripts/kinetic-caption-renderer.ts',
    '--run',
    runId,
    '--preset',
    'viral_review_v2',
    '--timing',
    timingPath,
    '--input',
    previewMp4,
    '--output',
    shortOut,
  ];
  if (scrubOk && existsSync(maskPath)) {
    capArgs.push('--subtitle-mask', maskPath, '--cover-mode', 'delogo');
  }
  console.log('[07] Caption Việt + che chữ Hán (caption:kinetic clean_sub + mask)…');
  if (!sh('npx', capArgs, 'CAPTION_FAILED', true)) process.exit(4);
  if (!existsSync(shortOut)) {
    console.error('🛑 SHORT_NOT_PRODUCED');
    process.exit(4);
  }

  // 6) Lightweight QA probe (no registry write — isolation).
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', shortOut],
    { encoding: 'utf8' },
  );
  let dur = 0;
  let hasAudio = false;
  try {
    const j = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    dur = Number.parseFloat(j.format?.duration ?? '0');
    hasAudio = (j.streams ?? []).some((s) => s.codec_type === 'audio');
  } catch {
    /* ignore */
  }

  console.log('------------------------------------------------------');
  console.log(`[07] ✅ Short (REAL pipeline): ${shortOut}`);
  console.log(`     duration: ${dur.toFixed(1)}s | audio: ${hasAudio ? '✅' : '❌'}`);
  console.log(`     scrub chữ Hán: ${scrubOk ? '✅ áp dụng' : '⚠ bỏ qua (detect lỗi)'}`);
  console.log(`     BGM: ${bgm ? `✅ ${bgm.trackId}` : '⚠ không'}`);
  console.log('     ISOLATION: không ghi data/temp/jobs/, không xoay bgm_library. Chưa publish.');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
