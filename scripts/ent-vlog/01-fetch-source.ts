// E1 step 01 — fetch Douyin/TikTok source (no-watermark) + probe metadata.
// CLI-only, no API key needed. Writes <workdir>/source.mp4 + source_meta.json.
//   pnpm tsx scripts/ent-vlog/01-fetch-source.ts --id ent_squid_001 --url <url>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_TEXT_DENSITY, measureTextDensityOnFrames } from '../subtitle-mask/text-density.js';
import { fetchDouyinSource, isDouyinUrl } from './lib/douyin-fetch.js';
import { workDir } from './lib/env.js';

function run(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, url: { type: 'string' } },
    strict: true,
  });
  const id = values.id;
  const url = values.url;
  if (!id || !url) {
    console.error('Usage: --id <slug> --url <douyin/tiktok url>');
    process.exit(1);
  }

  const dir = workDir(id);
  mkdirSync(dir, { recursive: true });

  let srcPath = join(dir, 'source.mp4');

  if (isDouyinUrl(url)) {
    // Douyin's yt-dlp extractor is broken by anti-bot ("Fresh cookies needed").
    // Drive a real persistent browser, capture the DASH streams, mux to source.mp4.
    console.log('[01] Fetching Douyin source via persistent browser (capture + mux)…');
    const res = await fetchDouyinSource({
      url,
      outPath: srcPath,
      workDir: dir,
      headful: process.env.DOUYIN_HEADFUL === '1',
    });
    if (!res.ok) {
      if (res.code === 'CAPTCHA') {
        console.error('🛑 DOUYIN_SETUP_REQUIRED');
        console.error(res.message);
        process.exit(7);
      }
      if (res.code === 'SESSION_EXPIRED') {
        // Mã riêng (exit 9): phiên Douyin chết ≠ video bị gỡ/mạng lỗi. UI dựa mã
        // này hiện nút "Đăng nhập lại Douyin" thay vì báo DOWNLOAD_FAILED mù.
        console.error('🛑 DOUYIN_SESSION_EXPIRED');
        console.error(res.message);
        process.exit(9);
      }
      console.error('🛑 DOWNLOAD_FAILED');
      console.error(`Douyin fetch thất bại (${res.code}): ${res.message}`);
      process.exit(2);
    }
    console.log(`[01] Source captured: ${(res.bytes / 1e6).toFixed(1)}MB → ${srcPath}`);
  } else {
    // TikTok / generic URLs: yt-dlp still works fine.
    const outTmpl = join(dir, 'source.%(ext)s');
    console.log(`[01] Downloading source (no-watermark) → ${dir}`);
    const dl = run('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '-f',
      'bv*+ba/b',
      '--merge-output-format',
      'mp4',
      '-o',
      outTmpl,
      url,
    ]);
    if (dl.status !== 0) {
      console.error('🛑 DOWNLOAD_FAILED');
      console.error(dl.stderr.slice(-1500));
      process.exit(2);
    }
  }

  // Resolve produced file (prefer source.mp4, else first source.*).
  if (!existsSync(srcPath)) {
    const found = readdirSync(dir).find((f) => f.startsWith('source.'));
    if (!found) {
      console.error('🛑 SOURCE_FILE_NOT_FOUND after download');
      process.exit(2);
    }
    srcPath = join(dir, found);
  }

  // Probe metadata.
  const probe = run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=width,height,r_frame_rate,codec_type',
    '-of',
    'json',
    srcPath,
  ]);
  if (probe.status !== 0) {
    console.error('🛑 PROBE_FAILED');
    console.error(probe.stderr.slice(-800));
    process.exit(3);
  }
  const meta = JSON.parse(probe.stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
  };
  const durationSec = Number.parseFloat(meta.format?.duration ?? '0');
  const v = (meta.streams ?? []).find((s) => s.codec_type === 'video');
  const hasAudio = (meta.streams ?? []).some((s) => s.codec_type === 'audio');
  let fps = 0;
  if (v?.r_frame_rate?.includes('/')) {
    const [n, d] = v.r_frame_rate.split('/').map(Number);
    if (n && d) fps = n / d;
  }

  const sourceMeta = {
    videoId: id,
    url,
    path: srcPath.replace(/\\/g, '/'),
    durationSec: Number(durationSec.toFixed(2)),
    width: v?.width ?? null,
    height: v?.height ?? null,
    fps: Number(fps.toFixed(2)),
    hasAudio,
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'source_meta.json'), JSON.stringify(sourceMeta, null, 2));

  // Phần 77 — HARDSUB TEXT DENSITY GATE (đồng bộ với intake lane Review): chữ
  // CJK nằm TRÊN vùng che được (midY < 0.70) thì scrub dải đáy không cứu được →
  // ≥40% frame dính = loại nguồn ngay tại intake (exit 8), trước khi tốn
  // ASR/montage/script. Không đo được (thiếu venv paddle) → warn, KHÔNG chặn.
  const densityFramesDir = join(dir, 'text_density_frames');
  rmSync(densityFramesDir, { recursive: true, force: true });
  mkdirSync(densityFramesDir, { recursive: true });
  const densityTs = Array.from(
    new Set(
      [
        1.0,
        durationSec * 0.25,
        durationSec * 0.5,
        durationSec * 0.75,
        Math.max(durationSec - 1.0, durationSec * 0.9),
      ]
        .map((t) => Math.round(t * 100) / 100)
        .filter((t) => t >= 0 && t <= durationSec),
    ),
  ).sort((a, b) => a - b);
  for (let i = 0; i < densityTs.length; i++) {
    run('ffmpeg', [
      '-y',
      '-ss',
      String(densityTs[i]),
      '-i',
      srcPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      join(densityFramesDir, `frame_${i + 1}.jpg`),
    ]);
  }
  const density = measureTextDensityOnFrames(densityFramesDir);
  writeFileSync(join(dir, 'text_density_report.json'), JSON.stringify(density, null, 2));
  if (density.status === 'TEXT_HEAVY') {
    console.error('🛑 TEXT_HEAVY');
    console.error(
      `Chữ CJK cứng ngoài vùng che được ở ${density.framesWithUnscrubbableCjk}/${density.framesSampled} frame (midY < ${DEFAULT_TEXT_DENSITY.scrubbableYMin}) — scrub dải đáy không cứu được, chọn video nguồn khác.`,
    );
    process.exit(8);
  }
  if (density.status !== 'OK') {
    console.warn(`     ⚠ text-density: ${density.status} — không đo được, không chặn.`);
  }

  const mins = Math.floor(durationSec / 60);
  const secs = Math.round(durationSec % 60);
  console.log('------------------------------------------------------');
  console.log(`[01] ✅ source ready: ${srcPath}`);
  console.log(`     duration : ${mins}m${secs}s (${sourceMeta.durationSec}s)`);
  console.log(`     video    : ${sourceMeta.width}x${sourceMeta.height} @ ${sourceMeta.fps}fps`);
  console.log(`     audio    : ${hasAudio ? 'present ✅' : 'MISSING ❌ (no speech to translate)'}`);
  if (density.status === 'OK') {
    console.log(
      `     text-density: OK (unscrubbable ${density.framesWithUnscrubbableCjk}/${density.framesSampled} frame)`,
    );
  }
  if (durationSec < 60) {
    console.log(
      '     ⚠ NOTE: video < 1 phút — ngắn hơn kỳ vọng 5-10 phút, clip-mining ít tác dụng.',
    );
  } else if (durationSec > 12 * 60) {
    console.log('     ⚠ NOTE: video > 12 phút — dài hơn kỳ vọng, sẽ tốn ASR hơn.');
  }
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
