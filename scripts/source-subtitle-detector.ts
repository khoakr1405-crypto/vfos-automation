#!/usr/bin/env tsx

/* =============================================================================
 * VFOS — Source Subtitle Detector (SERVER/LOCAL ONLY)
 * -----------------------------------------------------------------------------
 * Tự động NHẬN DIỆN vùng phụ đề tiếng Trung burned-in trong video reup:
 *   ffmpeg cắt frame @fps → ENGINE dò vùng chữ → lọc box CJK trong vùng phụ đề
 *   → gộp dòng → cluster theo thời gian → dải {start,end,box} → ghi
 *   data/temp/jobs/<id>/source_subtitle_mask.json (toạ độ 0–1).
 *
 * Engine (--engine):
 *   - 'paddle' (DEFAULT): PP-OCR text-detection (DBNet) qua venv Python
 *     (tools/subtitle-detect-paddle) — polygon ÔM TRỌN cả dòng, không rớt ký tự
 *     mép như word-box. Quét dày (5fps). Thiếu venv/lỗi → tự fallback tesseract.
 *   - 'tesseract': tesseract.js (chi_sim) word-box, 2fps — fallback.
 *
 * Safety: KHÔNG gọi API mạng nào (model/traineddata cache gitignored lần đầu).
 *   KHÔNG publish, KHÔNG đọc .env/secret. Output runtime.
 *
 * Usage:
 *   pnpm subtitle:detect --job <jobId>                  # engine paddle (default)
 *   pnpm subtitle:detect --job <id> --engine tesseract  # ép fallback
 *   pnpm subtitle:detect --input <video> --output <mask.json> --dry-run
 * ========================================================================== */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { OEM, PSM, createWorker } from 'tesseract.js';
import {
  type FrameDetection,
  type PixelBox,
  type SubtitleSegment,
  cjkRatio,
  clusterFramesToSegments,
  consolidateBands,
  isCjk,
  mergeBoxesToLines,
  stabilizeBands,
} from './subtitle-mask/detect-core.js';
import { PADDLE_PY, PADDLE_SCRIPT } from './subtitle-mask/text-density.js';

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

interface PaddleRegion {
  box: [number, number, number, number];
  text: string;
  score: number;
}

/**
 * Dò vùng chữ bằng PP-OCR text-detection (det ôm TRỌN cả dòng — không rớt ký tự
 * mép như word-box). Gọi venv Python qua detect.py, đọc JSON, lọc CJK + zone +
 * size → FrameDetection[]. Trả null nếu venv/script chưa có hoặc lỗi (→ caller
 * fallback tesseract). KHÔNG network (model đã cache).
 */
function detectPaddle(
  framesDir: string,
  frameFiles: string[],
  fW: number,
  fH: number,
  fps: number,
  yTop: number,
  yBot: number,
  minScore: number,
  lang: string,
): { dets: FrameDetection[]; sampleText: string } | null {
  const venvPy = resolve(PADDLE_PY);
  const script = resolve(PADDLE_SCRIPT);
  if (!existsSync(venvPy) || !existsSync(script)) return null;
  const outJson = join(framesDir, 'paddle_out.json');
  const paddleLang = lang === 'chi_sim' || lang === 'chi_tra' ? 'ch' : lang;
  const r = spawnSync(
    venvPy,
    [script, '--frames-dir', framesDir, '--out', outJson, '--lang', paddleLang],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0 || !existsSync(outJson)) {
    console.warn((r.stderr ?? '').slice(-400));
    return null;
  }
  let data: { frames?: Array<{ file: string; regions: PaddleRegion[] }> };
  try {
    data = JSON.parse(readFileSync(outJson, 'utf-8'));
  } catch {
    return null;
  }
  const indexOf = new Map(frameFiles.map((f, i) => [f, i] as const));
  const dets: FrameDetection[] = [];
  let sampleText = '';
  for (const fr of data.frames ?? []) {
    const idx = indexOf.get(fr.file);
    if (idx === undefined) continue;
    const boxes: PixelBox[] = [];
    for (const reg of fr.regions ?? []) {
      const text = (reg.text ?? '').trim();
      if (!isCjk(text) || cjkRatio(text) < 0.5) continue;
      if ((reg.score ?? 0) < minScore) continue;
      const [x, y, w, h] = reg.box;
      const midY = y + h / 2;
      if (midY < yTop || midY > yBot) continue;
      if (w < fW * 0.03 || h < fH * 0.012) continue; // bỏ noise quá nhỏ
      boxes.push({ x, y, w, h });
      if (!sampleText) sampleText = text;
    }
    const lines = mergeBoxesToLines(boxes);
    if (lines.length > 0) dets.push({ timeSec: idx / fps, lines });
  }
  return { dets, sampleText };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      job: { type: 'string' },
      input: { type: 'string' },
      output: { type: 'string' },
      // Engine dò vùng chữ: 'paddle' (PP-OCR text-detection, ôm trọn dòng — default)
      // hoặc 'tesseract' (word-box, fallback khi venv paddle chưa có).
      engine: { type: 'string', default: 'paddle' },
      fps: { type: 'string' },
      'det-width': { type: 'string' },
      'zone-top': { type: 'string', default: '0.45' },
      'zone-bottom': { type: 'string', default: '0.96' },
      'min-conf': { type: 'string', default: '45' },
      'min-score': { type: 'string', default: '0.6' },
      'max-frames': { type: 'string', default: '400' },
      lang: { type: 'string', default: 'chi_sim' },
      // STABLE BAND (opt-in cho lane reup): gộp mỗi băng-y thành 1 dải LIÊN TỤC
      // phủ từ giây 0 đến hết video + dilate → chống nhấp nháy & che hardsub đầu
      // video. Default OFF → Product Review giữ nguyên hành vi box khít.
      'stable-band': { type: 'boolean', default: false },
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

  const engine = (values.engine as string) === 'tesseract' ? 'tesseract' : 'paddle';
  // 2fps đủ bắt dòng phụ đề (mỗi dòng hiển thị vài giây → vài frame). Override --fps.
  const fps = values.fps ? Math.max(0.5, Number(values.fps)) : 2;
  // Bề rộng frame khi OCR: paddle CPU chậm theo pixel² → hạ 384px (số box detect
  // không đổi, nhanh ~2.5×). tesseract giữ 720px. Override --det-width.
  const detWidth = values['det-width']
    ? Math.max(160, Number(values['det-width']))
    : engine === 'paddle'
      ? 384
      : 720;
  const zoneTop = Number(values['zone-top']);
  const zoneBottom = Number(values['zone-bottom']);
  const minConf = Number(values['min-conf']);
  const minScore = Number(values['min-score']);
  const maxFrames = Number(values['max-frames']);

  const probe = ffprobe(inputVideo);
  console.log('======================================================');
  console.log(`🈲  VFOS Source Subtitle Detector (engine: ${engine})`);
  console.log('======================================================');
  console.log(`Input:    ${inputVideo}`);
  console.log(`Video:    ${probe.width}x${probe.height}, ${probe.durationSec.toFixed(1)}s`);
  console.log(
    `Sample:   ${fps} fps @${detWidth}px, zone y=[${zoneTop}, ${zoneBottom}], minConf=${minConf}`,
  );
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
      `fps=${fps},scale='min(${detWidth},iw)':-2`,
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

  // 2) Detect: engine 'paddle' (PP-OCR text-detection) → fallback 'tesseract'.
  const yTop = zoneTop * fH;
  const yBot = zoneBottom * fH;
  let frameDetections: FrameDetection[] = [];
  let firstSampleText = '';
  let engineUsed = engine;

  if (engine === 'paddle') {
    const paddle = detectPaddle(
      framesDir,
      frameFiles,
      fW,
      fH,
      fps,
      yTop,
      yBot,
      minScore,
      values.lang ?? 'chi_sim',
    );
    if (paddle) {
      frameDetections = paddle.dets;
      firstSampleText = paddle.sampleText;
    } else {
      console.warn(
        '⚠️ PaddleOCR không khả dụng (venv/script thiếu hoặc lỗi) → fallback tesseract.js',
      );
      engineUsed = 'tesseract';
    }
  }

  if (engineUsed === 'tesseract') {
    const worker = await createWorker(values.lang ?? 'chi_sim', OEM.LSTM_ONLY, {
      cachePath: resolve(TESS_CACHE),
      cacheMethod: 'readWrite',
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

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
  }

  console.log(
    `Detected: ${frameDetections.length}/${frameFiles.length} frame có chữ Trung (engine: ${engineUsed})`,
  );

  // 3) Cluster theo thời gian → đoạn rời rạc.
  const rawSegments: SubtitleSegment[] = clusterFramesToSegments(frameDetections, fW, fH);

  // 4) Gộp các đoạn CÙNG BĂNG thành dải LIÊN TỤC (lấp gap OCR-miss) → coverage
  //    đủ toàn timeline, không chỉ vài frame lẻ. Loại băng nhiễu/outlier.
  const consolidated: SubtitleSegment[] = consolidateBands(rawSegments);
  // 5) STABLE BAND (opt-in): mỗi băng-y → 1 dải phủ [0, duration] + dilate. Chống
  //    nhấp nháy giữa video + che hardsub đầu video. Default OFF (Product Review).
  const stableBand = values['stable-band'] === true;
  const segments: SubtitleSegment[] = stableBand
    ? stabilizeBands(consolidated, probe.durationSec)
    : consolidated;

  console.log(
    `Raw segments: ${rawSegments.length} → bands: ${consolidated.length}${stableBand ? ` → STABLE dải [0-${probe.durationSec.toFixed(0)}s]: ${segments.length}` : ' (liên tục)'}`,
  );
  for (const s of segments) {
    console.log(
      `  [${s.startSec.toFixed(1)}–${s.endSec.toFixed(1)}s] box x=${s.box.x} w=${s.box.w} y=${s.box.y} h=${s.box.h} frames=${s.frames}`,
    );
  }

  const mask = {
    maskVersion: stableBand ? ('v2-band' as const) : ('v1' as const),
    jobId,
    sourceVideoPath: inputVideo,
    videoWidth: probe.width,
    videoHeight: probe.height,
    sampleFps: fps,
    engine: engineUsed === 'paddle' ? 'paddleocr' : 'tesseract.js',
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
