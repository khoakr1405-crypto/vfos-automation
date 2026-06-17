#!/usr/bin/env tsx

/* =============================================================================
 * VFOS — Source Subtitle Detector (tesseract.js, SERVER/LOCAL ONLY)
 * -----------------------------------------------------------------------------
 * Tự động NHẬN DIỆN vùng phụ đề tiếng Trung burned-in trong video reup:
 *   ffmpeg cắt frame @fps → tesseract.js (chi_sim) OCR → lọc box CJK trong vùng
 *   phụ đề → gộp dòng → cluster theo thời gian → đoạn {start,end,box,bgComplexity}
 *   → ghi data/temp/jobs/<id>/source_subtitle_mask.json (toạ độ 0–1).
 *
 * Safety: KHÔNG gọi API mạng nào (ngoài tesseract.js tải traineddata về cache
 *   gitignored lần đầu). KHÔNG publish, KHÔNG đọc .env/secret. Output runtime.
 *
 * Usage:
 *   pnpm subtitle:detect --job <jobId>
 *   pnpm subtitle:detect --input <video> --output <mask.json>
 *   pnpm subtitle:detect --job <id> --fps 2 --dry-run
 * ========================================================================== */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createWorker, OEM, PSM } from 'tesseract.js';
import {
  clusterFramesToSegments,
  cjkRatio,
  consolidateBands,
  type FrameDetection,
  isCjk,
  mergeBoxesToLines,
  type PixelBox,
  type SubtitleSegment,
} from './subtitle-mask/detect-core.js';

const JOBS_ROOT = 'data/temp/jobs';
const TESS_CACHE = 'data/temp/tesseract-cache';

interface ProbeInfo {
  width: number;
  height: number;
  durationSec: number;
}

function ffprobe(video: string): ProbeInfo {
  const r = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'default=noprint_wrappers=1',
      video,
    ],
    { encoding: 'utf-8' },
  );
  const out = `${r.stdout ?? ''}`;
  const width = Number(out.match(/width=(\d+)/)?.[1] ?? 0);
  const height = Number(out.match(/height=(\d+)/)?.[1] ?? 0);
  const durationSec = Number(out.match(/duration=([\d.]+)/)?.[1] ?? 0);
  return { width, height, durationSec };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      job: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      fps: { type: 'string', default: '2' },
      'zone-top': { type: 'string', default: '0.45' },
      'zone-bottom': { type: 'string', default: '0.96' },
      'min-conf': { type: 'string', default: '45' },
      'max-frames': { type: 'string', default: '160' },
      lang: { type: 'string', default: 'chi_sim' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = (values.job as string | undefined) ?? null;
  let inputVideo = values.input ? resolve(values.input as string) : '';
  if (!inputVideo && jobId) {
    const preview = resolve(JOBS_ROOT, jobId, 'preview.mp4');
    const cleanSrc = resolve(`runs/${jobId}/source/clean_source_video.mp4`);
    inputVideo = existsSync(preview) ? preview : cleanSrc;
  }
  if (!inputVideo) {
    console.error('Error: --job <id> hoặc --input <video> là bắt buộc');
    process.exit(1);
  }
  if (!existsSync(inputVideo)) {
    console.error(`Error: input video không tồn tại: ${inputVideo}`);
    process.exit(1);
  }

  const outputPath = values.output
    ? resolve(values.output as string)
    : jobId
      ? resolve(JOBS_ROOT, jobId, 'source_subtitle_mask.json')
      : resolve('data/temp/source_subtitle_mask.json');

  const fps = Math.max(0.5, Number(values.fps));
  const zoneTop = Number(values['zone-top']);
  const zoneBottom = Number(values['zone-bottom']);
  const minConf = Number(values['min-conf']);
  const maxFrames = Number(values['max-frames']);

  const probe = ffprobe(inputVideo);
  console.log('======================================================');
  console.log('🈲  VFOS Source Subtitle Detector (tesseract.js)');
  console.log('======================================================');
  console.log(`Input:    ${inputVideo}`);
  console.log(`Video:    ${probe.width}x${probe.height}, ${probe.durationSec.toFixed(1)}s`);
  console.log(`Sample:   ${fps} fps, zone y=[${zoneTop}, ${zoneBottom}], minConf=${minConf}`);
  console.log(`Output:   ${outputPath}`);
  console.log('------------------------------------------------------');
  if (!probe.width || !probe.height) {
    console.error('Error: ffprobe không đọc được kích thước video.');
    process.exit(1);
  }

  // 1) Cắt frame ra thư mục tạm.
  const framesDir = resolve(
    'data/temp',
    jobId ? `subtitle-frames-${jobId}` : `subtitle-frames-${Date.now()}`,
  );
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const ex = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      inputVideo,
      '-vf',
      `fps=${fps},scale='min(720,iw)':-2`,
      '-frames:v',
      String(maxFrames),
      join(framesDir, 'f_%05d.png'),
    ],
    { encoding: 'utf-8' },
  );
  if (ex.status !== 0) {
    console.error('Error: ffmpeg cắt frame thất bại.');
    console.error((ex.stderr ?? '').slice(-500));
    process.exit(1);
  }
  const frameFiles = readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  if (frameFiles.length === 0) {
    console.error('Error: không cắt được frame nào.');
    process.exit(1);
  }
  // Đọc kích thước frame thực (đã scale) để chuẩn hoá box.
  const firstProbe = ffprobe(join(framesDir, frameFiles[0]!));
  const fW = firstProbe.width || probe.width;
  const fH = firstProbe.height || probe.height;
  console.log(`Frames:   ${frameFiles.length} @ ${fW}x${fH}`);

  // 2) OCR từng frame, lọc box CJK trong vùng phụ đề.
  const worker = await createWorker(values.lang ?? 'chi_sim', OEM.LSTM_ONLY, {
    cachePath: resolve(TESS_CACHE),
    cacheMethod: 'readWrite',
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

  const frameDetections: FrameDetection[] = [];
  let firstSampleText = '';
  const yTop = zoneTop * fH;
  const yBot = zoneBottom * fH;

  for (let i = 0; i < frameFiles.length; i++) {
    const timeSec = i / fps;
    const fpath = join(framesDir, frameFiles[i]!);
    let words: Array<{
      text?: string;
      confidence?: number;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
    }> = [];
    try {
      const { data } = await worker.recognize(fpath, {}, { blocks: true });
      const collected: typeof words = [];
      const anyData = data as unknown as {
        words?: typeof words;
        blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: typeof words }> }> }>;
      };
      if (Array.isArray(anyData.words) && anyData.words.length > 0) {
        collected.push(...anyData.words);
      } else {
        for (const blk of anyData.blocks ?? []) {
          for (const par of blk.paragraphs ?? []) {
            for (const ln of par.lines ?? []) {
              collected.push(...(ln.words ?? []));
            }
          }
        }
      }
      words = collected;
    } catch {
      continue;
    }

    const boxes: PixelBox[] = [];
    for (const w of words) {
      const text = (w.text ?? '').trim();
      const conf = w.confidence ?? 0;
      const bb = w.bbox;
      if (!bb || !text) continue;
      if (conf < minConf) continue;
      if (!isCjk(text) || cjkRatio(text) < 0.5) continue;
      const midY = (bb.y0 + bb.y1) / 2;
      if (midY < yTop || midY > yBot) continue;
      const box: PixelBox = { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 };
      if (box.w < fW * 0.03 || box.h < fH * 0.012) continue; // bỏ noise quá nhỏ
      boxes.push(box);
      if (!firstSampleText) firstSampleText = text;
    }
    const lines = mergeBoxesToLines(boxes);
    if (lines.length > 0) frameDetections.push({ timeSec, lines });
  }
  await worker.terminate();

  console.log(`Detected: ${frameDetections.length}/${frameFiles.length} frame có chữ Trung`);

  // 3) Cluster theo thời gian → đoạn rời rạc.
  const rawSegments: SubtitleSegment[] = clusterFramesToSegments(frameDetections, fW, fH);

  // 4) Gộp các đoạn CÙNG BĂNG thành dải LIÊN TỤC (lấp gap OCR-miss) → coverage
  //    đủ toàn timeline, không chỉ vài frame lẻ. Loại băng nhiễu/outlier.
  const segments: SubtitleSegment[] = consolidateBands(rawSegments);

  console.log(`Raw segments: ${rawSegments.length} → bands (liên tục): ${segments.length}`);
  for (const s of segments) {
    console.log(
      `  [${s.startSec.toFixed(1)}–${s.endSec.toFixed(1)}s] box x=${s.box.x} w=${s.box.w} y=${s.box.y} h=${s.box.h} frames=${s.frames}`,
    );
  }

  const mask = {
    maskVersion: 'v1' as const,
    jobId,
    sourceVideoPath: inputVideo,
    videoWidth: probe.width,
    videoHeight: probe.height,
    sampleFps: fps,
    engine: 'tesseract.js',
    lang: values.lang ?? 'chi_sim',
    sampleText: firstSampleText.slice(0, 40),
    segments,
    safety: { apiCalled: false, networkExceptTraineddata: true },
    detectedAt: new Date().toISOString(),
  };

  if (values['dry-run']) {
    console.log('DRY-RUN — không ghi mask. Segments:', segments.length);
  } else {
    mkdirSync(resolve(outputPath, '..'), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(mask, null, 2)}\n`, 'utf-8');
    console.log(`✅ Mask written: ${outputPath}`);
  }

  // Dọn frame tạm.
  rmSync(framesDir, { recursive: true, force: true });
  console.log('======================================================');
}

main().catch((err) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
