/* =============================================================================
 * VFOS — CJK hardsub TEXT DENSITY gate (intake pre-filter, cả 2 lane)
 * -----------------------------------------------------------------------------
 * Bài học job_20260715_002 (07/2026): video POV chữ Trung to nằm GIỮA/TRÊN khung
 * hình — ngoài dải delogo đáy nên KHÔNG che được; scrub im lặng bỏ qua và video
 * thành phẩm vẫn nguyên chữ Trung. Gate này đo "mật độ chữ CJK ngoài vùng che
 * được" trên các frame trích lúc intake để LOẠI nguồn như vậy từ đầu.
 *
 * Quy ước "che được": chỉ dải ĐÁY (midY ≥ SCRUBBABLE_Y_MIN) — nơi delogo band /
 * caption overlay hoạt động mà không phá hình. Chữ CJK phía trên dải đó = không
 * cứu được → nếu xuất hiện ở ≥ HEAVY_FRAME_RATIO số frame → TEXT_HEAVY.
 *
 * Verdict thuần (assessTextDensity) tách khỏi IO (measureTextDensityOnFrames —
 * spawn PP-OCR venv, cùng engine với source-subtitle-detector). Không network.
 * ========================================================================== */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type PixelBox, cjkRatio, isCjk, mergeBoxesToLines } from './detect-core.js';

// SSOT đường dẫn PP-OCR venv — source-subtitle-detector.ts import lại từ đây.
export const PADDLE_PY = 'tools/subtitle-detect-paddle/.venv/Scripts/python.exe';
export const PADDLE_SCRIPT = 'tools/subtitle-detect-paddle/detect.py';

export interface TextDensityOptions {
  /** midY (0–1) từ ngưỡng này trở XUỐNG đáy = vùng che được (delogo/caption band). */
  scrubbableYMin: number;
  /** Tỉ lệ frame dính chữ không-che-được để phán TEXT_HEAVY. */
  heavyFrameRatio: number;
  /** Ngưỡng score OCR tối thiểu (khớp detector min-score). */
  minScore: number;
}

export const DEFAULT_TEXT_DENSITY: TextDensityOptions = {
  scrubbableYMin: 0.7,
  heavyFrameRatio: 0.4,
  minScore: 0.6,
};

/** Quan sát 1 frame: các line-box CJK đã lọc noise, toạ độ midY chuẩn hoá 0–1. */
export interface FrameCjkObservation {
  frameFile: string;
  cjkLineMidYs: number[];
}

export interface TextDensityAssessment {
  status: 'TEXT_HEAVY' | 'OK' | 'SKIPPED_NO_ENGINE' | 'SKIPPED_NO_FRAMES';
  engine: 'paddleocr' | 'none';
  framesSampled: number;
  framesWithUnscrubbableCjk: number;
  /** framesWithUnscrubbableCjk / framesSampled (0 khi không sample được). */
  unscrubbableFrameRatio: number;
  /** Frame CHỈ có chữ ở dải đáy che được (scrub xử lý bình thường). */
  framesWithScrubbableOnlyCjk: number;
  sampleText: string;
  thresholds: TextDensityOptions;
  assessedAt: string;
}

/**
 * Verdict thuần từ các quan sát frame (không IO). Frame "dính" khi có ≥1 line
 * CJK với midY NẰM TRÊN vùng che được (midY < scrubbableYMin). Chữ ở dải đáy
 * không tính — scrub/delogo hiện có xử lý được.
 */
export function assessTextDensity(
  observations: readonly FrameCjkObservation[],
  framesSampled: number,
  opts: TextDensityOptions = DEFAULT_TEXT_DENSITY,
  meta: { engine: 'paddleocr' | 'none'; sampleText: string } = {
    engine: 'paddleocr',
    sampleText: '',
  },
): TextDensityAssessment {
  const base = {
    engine: meta.engine,
    framesSampled,
    sampleText: meta.sampleText,
    thresholds: opts,
    assessedAt: new Date().toISOString(),
  };
  if (framesSampled <= 0) {
    return {
      ...base,
      status: 'SKIPPED_NO_FRAMES',
      framesWithUnscrubbableCjk: 0,
      unscrubbableFrameRatio: 0,
      framesWithScrubbableOnlyCjk: 0,
    };
  }
  let unscrubbable = 0;
  let scrubbableOnly = 0;
  for (const obs of observations) {
    if (obs.cjkLineMidYs.length === 0) continue;
    if (obs.cjkLineMidYs.some((midY) => midY < opts.scrubbableYMin)) unscrubbable++;
    else scrubbableOnly++;
  }
  const ratio = Math.round((unscrubbable / framesSampled) * 1000) / 1000;
  return {
    ...base,
    status: ratio >= opts.heavyFrameRatio ? 'TEXT_HEAVY' : 'OK',
    framesWithUnscrubbableCjk: unscrubbable,
    unscrubbableFrameRatio: ratio,
    framesWithScrubbableOnlyCjk: scrubbableOnly,
  };
}

interface PaddleRegion {
  box: [number, number, number, number];
  text: string;
  score: number;
}

/**
 * Đo density trên thư mục frame JPG (đã trích sẵn lúc intake). Chạy PP-OCR venv
 * (cùng engine detector, KHÔNG network — model đã cache); venv thiếu → trả
 * SKIPPED_NO_ENGINE (KHÔNG chặn intake, caller phải log to). Kích thước frame
 * đọc từ ffprobe frame đầu (frame trích 1:1 kích thước video).
 */
export function measureTextDensityOnFrames(
  framesDir: string,
  opts: TextDensityOptions = DEFAULT_TEXT_DENSITY,
): TextDensityAssessment {
  const frameFiles = existsSync(framesDir)
    ? readdirSync(framesDir)
        .filter((f) => /\.jpe?g$/i.test(f))
        .sort()
    : [];
  const firstFrame = frameFiles[0];
  if (frameFiles.length === 0 || firstFrame === undefined) {
    return assessTextDensity([], 0, opts, { engine: 'none', sampleText: '' });
  }

  const venvPy = resolve(PADDLE_PY);
  const script = resolve(PADDLE_SCRIPT);
  if (!existsSync(venvPy) || !existsSync(script)) {
    return {
      ...assessTextDensity([], 0, opts, { engine: 'none', sampleText: '' }),
      status: 'SKIPPED_NO_ENGINE',
      framesSampled: frameFiles.length,
    };
  }

  const dims = probeImageDims(join(framesDir, firstFrame));
  if (!dims) {
    return {
      ...assessTextDensity([], 0, opts, { engine: 'none', sampleText: '' }),
      status: 'SKIPPED_NO_ENGINE',
      framesSampled: frameFiles.length,
    };
  }

  const outJson = join(framesDir, 'paddle_out.json');
  const r = spawnSync(
    venvPy,
    [script, '--frames-dir', framesDir, '--out', outJson, '--lang', 'ch'],
    {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.status !== 0 || !existsSync(outJson)) {
    console.warn((r.stderr ?? '').slice(-400));
    return {
      ...assessTextDensity([], 0, opts, { engine: 'none', sampleText: '' }),
      status: 'SKIPPED_NO_ENGINE',
      framesSampled: frameFiles.length,
    };
  }

  let data: { frames?: Array<{ file: string; regions?: PaddleRegion[] }> };
  try {
    data = JSON.parse(readFileSync(outJson, 'utf-8')) as typeof data;
  } catch {
    return {
      ...assessTextDensity([], 0, opts, { engine: 'none', sampleText: '' }),
      status: 'SKIPPED_NO_ENGINE',
      framesSampled: frameFiles.length,
    };
  }

  const byFile = new Map((data.frames ?? []).map((f) => [f.file, f.regions ?? []] as const));
  const observations: FrameCjkObservation[] = [];
  let sampleText = '';
  for (const file of frameFiles) {
    const boxes: PixelBox[] = [];
    for (const reg of byFile.get(file) ?? []) {
      const text = (reg.text ?? '').trim();
      if (!isCjk(text) || cjkRatio(text) < 0.5) continue;
      if ((reg.score ?? 0) < opts.minScore) continue;
      const [x, y, w, h] = reg.box;
      if (w < dims.w * 0.03 || h < dims.h * 0.012) continue; // noise quá nhỏ (khớp detector)
      boxes.push({ x, y, w, h });
      if (!sampleText) sampleText = text;
    }
    const lines = mergeBoxesToLines(boxes);
    observations.push({
      frameFile: file,
      cjkLineMidYs: lines.map((l) => (l.y + l.h / 2) / dims.h),
    });
  }

  return assessTextDensity(observations, frameFiles.length, opts, {
    engine: 'paddleocr',
    sampleText,
  });
}

function probeImageDims(imagePath: string): { w: number; h: number } | null {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', imagePath],
    { encoding: 'utf-8' },
  );
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
    };
    const s = (parsed.streams ?? []).find((st) => st.width && st.height);
    return s?.width && s.height ? { w: s.width, h: s.height } : null;
  } catch {
    return null;
  }
}
